from __future__ import annotations

import asyncio
import json
import logging
from collections import deque
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable
from uuid import uuid4

import paho.mqtt.client as mqtt

from config import AppConfig

LOGGER = logging.getLogger(__name__)
CommandHandler = Callable[[dict[str, Any]], Awaitable[None]]


class MqttService:
    def __init__(self, config: AppConfig, loop: asyncio.AbstractEventLoop) -> None:
        self.config = config
        self.loop = loop
        try:
            self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"edge-{config.site.id}", clean_session=True)
        except (AttributeError, TypeError):
            self.client = mqtt.Client(client_id=f"edge-{config.site.id}", clean_session=True)
        if config.mqtt.username:
            self.client.username_pw_set(config.mqtt.username, config.mqtt.password)
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message
        self.connected = False
        self.buffer: deque[tuple[str, str, int, bool]] = deque(maxlen=config.mqtt.memory_buffer_limit)
        self.command_handler: CommandHandler | None = None

    def start(self) -> None:
        self.client.reconnect_delay_set(min_delay=1, max_delay=60)
        self.client.connect_async(self.config.mqtt.broker, self.config.mqtt.port, self.config.mqtt.keepalive)
        self.client.loop_start()

    def stop(self) -> None:
        self.client.loop_stop()
        self.client.disconnect()

    def _on_connect(self, client: mqtt.Client, userdata: object, flags: object, reason_code: object, properties: object = None) -> None:
        self.connected = True
        LOGGER.info("Connected to MQTT broker %s:%s", self.config.mqtt.broker, self.config.mqtt.port)
        client.subscribe(f"weighbridge/{self.config.site.id}/gate/command", qos=1)
        while self.buffer:
            topic, payload, qos, retain = self.buffer.popleft()
            client.publish(topic, payload, qos=qos, retain=retain)

    def _on_disconnect(self, client: mqtt.Client, userdata: object, *args: object) -> None:
        self.connected = False
        LOGGER.warning("MQTT disconnected; messages will be buffered")

    def _on_message(self, client: mqtt.Client, userdata: object, message: mqtt.MQTTMessage) -> None:
        if self.command_handler is None:
            return
        try:
            payload = json.loads(message.payload.decode("utf-8"))
            body = payload.get("payload", payload)
            asyncio.run_coroutine_threadsafe(self.command_handler(body), self.loop)
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            LOGGER.error("Invalid MQTT command: %s", error)

    def envelope(self, payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "message_id": str(uuid4()),
            "site_id": self.config.site.id,
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
        }

    def publish(self, suffix: str, payload: dict[str, Any], qos: int = 0, retain: bool = False) -> None:
        topic = suffix if suffix.startswith("dashboard/") or suffix.startswith("sync/") else f"weighbridge/{self.config.site.id}/{suffix}"
        encoded = json.dumps(self.envelope(payload), separators=(",", ":"), default=str)
        if not self.connected:
            self.buffer.append((topic, encoded, qos, retain))
            return
        result = self.client.publish(topic, encoded, qos=qos, retain=retain)
        if result.rc != mqtt.MQTT_ERR_SUCCESS:
            self.buffer.append((topic, encoded, qos, retain))
