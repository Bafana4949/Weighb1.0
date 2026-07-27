#!/usr/bin/env python3
"""Virtual weighbridge microcontroller.

The simulator emits the exact UART framing used by the future PIC firmware:
    #WT:054320;P1:1;P2:1;RF:DRV00421;ST:STABLE$\r\n
It supports three interchangeable transports:
  * TCP serial bridge (default and easiest on Windows)
  * POSIX pseudo-terminal (Linux/macOS)
  * Existing serial port (for com0com or physical loopback)

The site daemon does not know or care whether the bytes originated here or from
real hardware; only the transport configuration changes.
"""
from __future__ import annotations

import argparse
import json
import os
import queue
import select
import socket
import sys
import threading
import time
from dataclasses import dataclass, field
from typing import BinaryIO, Callable

try:
    import tkinter as tk
    from tkinter import ttk
except ImportError:  # Linux may require python3-tk.
    tk = None
    ttk = None

try:
    import serial
except ImportError:  # TCP/PTY simulation does not require pyserial.
    serial = None  # type: ignore[assignment]

SerialException = getattr(serial, "SerialException", OSError)

TELEMETRY_INTERVAL_SECONDS = 0.100
MAX_WEIGHT_KG = 80_000


@dataclass
class OutputState:
    entry_gate: str = "CLOSED"
    exit_gate: str = "CLOSED"
    entry_light: str = "RED"
    exit_light: str = "RED"
    buzzer: bool = False


@dataclass
class SimulatorState:
    weight_kg: int = 0
    beam_1: bool = False
    beam_2: bool = False
    rfid_tag: str = "00000000"
    scale_status: str = "STABLE"
    outputs: OutputState = field(default_factory=OutputState)
    lock: threading.RLock = field(default_factory=threading.RLock, repr=False)

    def telemetry_frame(self) -> bytes:
        with self.lock:
            weight = max(0, min(MAX_WEIGHT_KG, int(self.weight_kg)))
            rfid = (self.rfid_tag.strip() or "00000000").replace(";", "")[:24]
            status = self.scale_status if self.scale_status in {"STABLE", "UNSTABLE", "FAULT"} else "UNSTABLE"
            frame = (
                f"#WT:{weight:06d};P1:{int(self.beam_1)};P2:{int(self.beam_2)};"
                f"RF:{rfid};ST:{status}$\r\n"
            )
            return frame.encode("ascii", errors="strict")

    def update_from_control(self, command: dict[str, object]) -> None:
        with self.lock:
            if "weight_kg" in command:
                self.weight_kg = max(0, min(MAX_WEIGHT_KG, int(command["weight_kg"])))
            if "p1" in command:
                self.beam_1 = bool(command["p1"])
            if "p2" in command:
                self.beam_2 = bool(command["p2"])
            if "rfid" in command:
                self.rfid_tag = str(command["rfid"])
            if "scale_status" in command:
                self.scale_status = str(command["scale_status"]).upper()

    def apply_device_command(self, raw_command: str) -> str:
        command = raw_command.strip()
        if not (command.startswith("@CMD:") and command.endswith("$")):
            return f"IGNORED malformed command: {command!r}"

        body = command[5:-1]
        fields: dict[str, str] = {}
        parts = body.split(";")
        action = parts[0].strip().upper()
        for item in parts[1:]:
            if ":" in item:
                key, value = item.split(":", 1)
                fields[key.strip().upper()] = value.strip().upper()

        with self.lock:
            target = fields.get("TGT", "")
            value = fields.get("VAL", "")
            if action == "GATE_OPEN" and target in {"ENTRY", "EXIT"}:
                setattr(self.outputs, f"{target.lower()}_gate", "OPEN")
            elif action == "GATE_CLOSE" and target in {"ENTRY", "EXIT"}:
                setattr(self.outputs, f"{target.lower()}_gate", "CLOSED")
            elif action == "LIGHT" and target in {"ENTRY", "EXIT"} and value in {"RED", "GREEN"}:
                setattr(self.outputs, f"{target.lower()}_light", value)
            elif action == "BUZZER" and value in {"ON", "OFF"}:
                self.outputs.buzzer = value == "ON"
                if self.outputs.buzzer:
                    print("\a", end="", flush=True)
            else:
                return f"IGNORED unsupported command: {command}"

            return (
                f"APPLIED {command} | entry_gate={self.outputs.entry_gate} "
                f"exit_gate={self.outputs.exit_gate} entry_light={self.outputs.entry_light} "
                f"exit_light={self.outputs.exit_light} buzzer={self.outputs.buzzer}"
            )


class CommandFramer:
    """Collects arbitrarily split serial bytes into '$' terminated commands."""

    def __init__(self) -> None:
        self._buffer = bytearray()

    def feed(self, data: bytes) -> list[str]:
        self._buffer.extend(data)
        commands: list[str] = []
        while b"$" in self._buffer:
            end = self._buffer.index(ord("$"))
            packet = bytes(self._buffer[: end + 1])
            del self._buffer[: end + 1]
            self._buffer = self._buffer.lstrip(b"\r\n")
            commands.append(packet.decode("ascii", errors="replace"))
        if len(self._buffer) > 4096:
            self._buffer.clear()
        return commands


class TcpSerialBridge:
    """A cross-platform TCP stream that behaves like a serial byte channel."""

    def __init__(self, state: SimulatorState, host: str, port: int) -> None:
        self.state = state
        self.host = host
        self.port = port
        self.stop_event = threading.Event()
        self.clients: set[socket.socket] = set()
        self.clients_lock = threading.Lock()

    def serve(self) -> None:
        listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind((self.host, self.port))
        listener.listen(8)
        listener.settimeout(0.5)
        print(f"Virtual UART TCP endpoint: tcp://{self.host}:{self.port}")
        threading.Thread(target=self._broadcast_loop, daemon=True).start()
        try:
            while not self.stop_event.is_set():
                try:
                    client, address = listener.accept()
                except socket.timeout:
                    continue
                client.settimeout(0.5)
                with self.clients_lock:
                    self.clients.add(client)
                print(f"Site daemon connected from {address[0]}:{address[1]}")
                threading.Thread(target=self._client_reader, args=(client,), daemon=True).start()
        finally:
            listener.close()
            self.close()

    def _broadcast_loop(self) -> None:
        deadline = time.monotonic()
        while not self.stop_event.is_set():
            frame = self.state.telemetry_frame()
            stale: list[socket.socket] = []
            with self.clients_lock:
                clients = list(self.clients)
            for client in clients:
                try:
                    client.sendall(frame)
                except OSError:
                    stale.append(client)
            for client in stale:
                self._remove_client(client)
            deadline += TELEMETRY_INTERVAL_SECONDS
            time.sleep(max(0, deadline - time.monotonic()))

    def _client_reader(self, client: socket.socket) -> None:
        framer = CommandFramer()
        try:
            while not self.stop_event.is_set():
                try:
                    data = client.recv(1024)
                except socket.timeout:
                    continue
                if not data:
                    break
                for command in framer.feed(data):
                    print(self.state.apply_device_command(command))
        except OSError:
            pass
        finally:
            self._remove_client(client)

    def _remove_client(self, client: socket.socket) -> None:
        with self.clients_lock:
            self.clients.discard(client)
        try:
            client.close()
        except OSError:
            pass

    def close(self) -> None:
        self.stop_event.set()
        with self.clients_lock:
            clients = list(self.clients)
            self.clients.clear()
        for client in clients:
            try:
                client.close()
            except OSError:
                pass


class ControlServer:
    """Receives JSON lines from scenarios.py to manipulate simulated inputs."""

    def __init__(self, state: SimulatorState, host: str, port: int) -> None:
        self.state = state
        self.host = host
        self.port = port

    def serve(self) -> None:
        listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind((self.host, self.port))
        listener.listen(4)
        print(f"Scenario control endpoint: tcp://{self.host}:{self.port}")
        while True:
            client, _ = listener.accept()
            threading.Thread(target=self._handle_client, args=(client,), daemon=True).start()

    def _handle_client(self, client: socket.socket) -> None:
        with client, client.makefile("rwb") as stream:
            while line := stream.readline():
                try:
                    command = json.loads(line)
                    if not isinstance(command, dict):
                        raise ValueError("control message must be a JSON object")
                    self.state.update_from_control(command)
                    response = {"ok": True, "state": snapshot(self.state)}
                except (ValueError, TypeError, json.JSONDecodeError) as error:
                    response = {"ok": False, "error": str(error)}
                stream.write((json.dumps(response) + "\n").encode())
                stream.flush()


class StreamTransport:
    def __init__(self, state: SimulatorState, stream: BinaryIO, name: str) -> None:
        self.state = state
        self.stream = stream
        self.name = name
        self.stop_event = threading.Event()

    def serve(self) -> None:
        print(f"Virtual UART serial endpoint: {self.name}")
        threading.Thread(target=self._writer, daemon=True).start()
        framer = CommandFramer()
        while not self.stop_event.is_set():
            try:
                data = self.stream.read(256)
            except (OSError, SerialException):
                time.sleep(0.5)
                continue
            if data:
                for command in framer.feed(data):
                    print(self.state.apply_device_command(command))

    def _writer(self) -> None:
        deadline = time.monotonic()
        while not self.stop_event.is_set():
            try:
                self.stream.write(self.state.telemetry_frame())
                self.stream.flush()
            except (OSError, SerialException):
                pass
            deadline += TELEMETRY_INTERVAL_SECONDS
            time.sleep(max(0, deadline - time.monotonic()))


def snapshot(state: SimulatorState) -> dict[str, object]:
    with state.lock:
        return {
            "weight_kg": state.weight_kg,
            "p1": state.beam_1,
            "p2": state.beam_2,
            "rfid": state.rfid_tag,
            "scale_status": state.scale_status,
            "outputs": {
                "entry_gate": state.outputs.entry_gate,
                "exit_gate": state.outputs.exit_gate,
                "entry_light": state.outputs.entry_light,
                "exit_light": state.outputs.exit_light,
                "buzzer": state.outputs.buzzer,
            },
        }


class SimulatorGui:
    def __init__(self, state: SimulatorState) -> None:
        if tk is None or ttk is None:
            raise RuntimeError("tkinter is unavailable. Install python3-tk or use --headless.")
        self.state = state
        self.root = tk.Tk()
        self.root.title("Weighbridge Hardware Simulator")
        self.root.geometry("720x520")
        self.root.minsize(650, 460)
        self.weight_var = tk.IntVar(value=state.weight_kg)
        self.p1_var = tk.BooleanVar(value=state.beam_1)
        self.p2_var = tk.BooleanVar(value=state.beam_2)
        self.rfid_var = tk.StringVar(value=state.rfid_tag)
        self.status_var = tk.StringVar(value=state.scale_status)
        self.output_text = tk.StringVar()
        self._build()
        self._poll_outputs()

    def _build(self) -> None:
        frame = ttk.Frame(self.root, padding=18)
        frame.pack(fill="both", expand=True)
        ttk.Label(frame, text="Virtual MCU Inputs", font=("Segoe UI", 16, "bold")).pack(anchor="w")
        ttk.Label(frame, text="All values are emitted over the configured UART transport every 100 ms.").pack(anchor="w", pady=(2, 16))

        weight_box = ttk.LabelFrame(frame, text="Weighbridge load", padding=12)
        weight_box.pack(fill="x")
        self.weight_label = ttk.Label(weight_box, text="0 kg", font=("Consolas", 20, "bold"))
        self.weight_label.pack(anchor="w")
        scale = ttk.Scale(weight_box, from_=0, to=MAX_WEIGHT_KG, variable=self.weight_var, command=self._weight_changed)
        scale.pack(fill="x", pady=(8, 0))

        sensors = ttk.LabelFrame(frame, text="Position sensors", padding=12)
        sensors.pack(fill="x", pady=12)
        ttk.Checkbutton(sensors, text="IR Beam 1 blocked", variable=self.p1_var, command=self._inputs_changed).pack(side="left", padx=(0, 24))
        ttk.Checkbutton(sensors, text="IR Beam 2 blocked", variable=self.p2_var, command=self._inputs_changed).pack(side="left")

        identity = ttk.LabelFrame(frame, text="Driver and scale", padding=12)
        identity.pack(fill="x")
        ttk.Label(identity, text="RFID tag").grid(row=0, column=0, sticky="w")
        rfid_entry = ttk.Entry(identity, textvariable=self.rfid_var, width=30)
        rfid_entry.grid(row=1, column=0, sticky="ew", padx=(0, 16))
        rfid_entry.bind("<KeyRelease>", lambda _: self._inputs_changed())
        ttk.Label(identity, text="Scale status").grid(row=0, column=1, sticky="w")
        status = ttk.Combobox(identity, textvariable=self.status_var, values=["STABLE", "UNSTABLE", "FAULT"], state="readonly", width=16)
        status.grid(row=1, column=1, sticky="w")
        status.bind("<<ComboboxSelected>>", lambda _: self._inputs_changed())
        identity.columnconfigure(0, weight=1)

        output = ttk.LabelFrame(frame, text="MCU outputs commanded by site daemon", padding=12)
        output.pack(fill="both", expand=True, pady=(12, 0))
        ttk.Label(output, textvariable=self.output_text, font=("Consolas", 11), justify="left").pack(anchor="w")

    def _weight_changed(self, _: str) -> None:
        value = int(self.weight_var.get())
        self.weight_label.configure(text=f"{value:,} kg")
        with self.state.lock:
            self.state.weight_kg = value

    def _inputs_changed(self) -> None:
        with self.state.lock:
            self.state.beam_1 = self.p1_var.get()
            self.state.beam_2 = self.p2_var.get()
            self.state.rfid_tag = self.rfid_var.get()
            self.state.scale_status = self.status_var.get()

    def _poll_outputs(self) -> None:
        current = snapshot(self.state)
        outputs = current["outputs"]
        self.output_text.set(
            f"ENTRY GATE : {outputs['entry_gate']}\n"
            f"EXIT GATE  : {outputs['exit_gate']}\n"
            f"ENTRY LIGHT: {outputs['entry_light']}\n"
            f"EXIT LIGHT : {outputs['exit_light']}\n"
            f"BUZZER     : {'ON' if outputs['buzzer'] else 'OFF'}"
        )
        self.root.after(200, self._poll_outputs)

    def run(self) -> None:
        self.root.mainloop()


def open_pty_transport(state: SimulatorState) -> StreamTransport:
    import pty
    import tty

    master_fd, slave_fd = pty.openpty()
    tty.setraw(master_fd)
    tty.setraw(slave_fd)
    slave_name = os.ttyname(slave_fd)
    master = os.fdopen(master_fd, "r+b", buffering=0)
    return StreamTransport(state, master, slave_name)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Weighbridge MCU simulator")
    parser.add_argument("--headless", action="store_true", help="Run without tkinter")
    parser.add_argument("--tcp-host", default="127.0.0.1")
    parser.add_argument("--tcp-port", type=int, default=7001)
    parser.add_argument("--control-port", type=int, default=7002)
    parser.add_argument("--serial-port", help="Use an existing serial port, e.g. COM11 or /dev/ttyUSB0")
    parser.add_argument("--baud-rate", type=int, default=115200)
    parser.add_argument("--pty", action="store_true", help="Create a POSIX pseudo-terminal instead of TCP")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    state = SimulatorState()
    threading.Thread(target=ControlServer(state, args.tcp_host, args.control_port).serve, daemon=True).start()

    if args.serial_port:
        if serial is None:
            raise RuntimeError("pyserial is required only for --serial-port mode; install requirements.txt")
        port = serial.Serial(args.serial_port, args.baud_rate, timeout=0.1, write_timeout=0.5)
        transport: object = StreamTransport(state, port, args.serial_port)
    elif args.pty:
        if os.name == "nt":
            raise RuntimeError("PTY mode is not available on Windows. Use TCP or com0com with --serial-port.")
        transport = open_pty_transport(state)
    else:
        transport = TcpSerialBridge(state, args.tcp_host, args.tcp_port)

    worker = threading.Thread(target=transport.serve, daemon=True)  # type: ignore[attr-defined]
    worker.start()

    try:
        if args.headless:
            while worker.is_alive():
                time.sleep(1)
        else:
            SimulatorGui(state).run()
    except KeyboardInterrupt:
        pass
    finally:
        if hasattr(transport, "close"):
            transport.close()  # type: ignore[attr-defined]
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
