from __future__ import annotations

import re
from datetime import datetime, timezone

from models import TelemetryFrame

FRAME_PATTERN = re.compile(
    r"^#WT:(?P<weight>\d{1,6});P1:(?P<p1>[01]);P2:(?P<p2>[01]);"
    r"RF:(?P<rfid>[^;$]{1,24});ST:(?P<status>STABLE|UNSTABLE|FAULT)\$$"
)


class TelemetryParser:
    """Incrementally parses partial, combined, and noisy serial chunks."""

    def __init__(self, max_buffer_bytes: int = 8192) -> None:
        self._buffer = bytearray()
        self.max_buffer_bytes = max_buffer_bytes
        self.corrupt_frame_count = 0

    def feed(self, data: bytes) -> list[TelemetryFrame]:
        self._buffer.extend(data)
        frames: list[TelemetryFrame] = []
        while b"$" in self._buffer:
            end = self._buffer.index(ord("$"))
            candidate = bytes(self._buffer[: end + 1])
            del self._buffer[: end + 1]
            self._buffer = self._buffer.lstrip(b"\r\n\x00")
            start = candidate.rfind(b"#")
            if start < 0:
                self.corrupt_frame_count += 1
                continue
            text = candidate[start:].decode("ascii", errors="replace")
            parsed = parse_telemetry_frame(text)
            if parsed is None:
                self.corrupt_frame_count += 1
            else:
                frames.append(parsed)
        if len(self._buffer) > self.max_buffer_bytes:
            last_start = self._buffer.rfind(b"#")
            self._buffer = self._buffer[last_start:] if last_start >= 0 else bytearray()
            self.corrupt_frame_count += 1
        return frames


def parse_telemetry_frame(text: str) -> TelemetryFrame | None:
    cleaned = text.strip("\r\n\x00 ")
    match = FRAME_PATTERN.fullmatch(cleaned)
    if not match:
        return None
    weight = int(match.group("weight"))
    if weight > 999_999:
        return None
    rfid = match.group("rfid").strip()
    return TelemetryFrame(
        weight_kg=weight,
        position_sensor_1=match.group("p1") == "1",
        position_sensor_2=match.group("p2") == "1",
        rfid_tag=None if rfid in {"", "00000000", "NONE"} else rfid,
        scale_status=match.group("status"),
        received_at=datetime.now(timezone.utc),
        raw=cleaned,
    )


def build_command(action: str, target: str | None = None, value: str | None = None) -> bytes:
    action = action.strip().upper()
    allowed_actions = {"GATE_OPEN", "GATE_CLOSE", "LIGHT", "BUZZER"}
    if action not in allowed_actions:
        raise ValueError(f"unsupported command action: {action}")
    parts = [f"@CMD:{action}"]
    if target is not None:
        target = target.strip().upper()
        if target not in {"ENTRY", "EXIT"}:
            raise ValueError("target must be ENTRY or EXIT")
        parts.append(f"TGT:{target}")
    if value is not None:
        clean_value = value.strip().upper()
        if clean_value not in {"RED", "GREEN", "ON", "OFF"}:
            raise ValueError("invalid command value")
        parts.append(f"VAL:{clean_value}")
    return (";".join(parts) + "$\r\n").encode("ascii")


def parse_command(packet: bytes) -> tuple[str, str | None, str | None]:
    """Inverse of build_command: (action, target, value)."""
    text = packet.decode("ascii").strip()
    if not (text.startswith("@CMD:") and text.endswith("$")):
        raise ValueError(f"malformed command packet: {text!r}")
    parts = text[5:-1].split(";")
    fields = dict(part.split(":", 1) for part in parts[1:] if ":" in part)
    return parts[0], fields.get("TGT"), fields.get("VAL")
