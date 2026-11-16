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
from topics import LANE_SUFFIXES, SITE_SUFFIXES, SequenceCounter, TopicBuilder

LOGGER = logging.getLogger(__name__)
# (topic, lane_number parsed from the topic or None, decoded JSON payload)
CommandHandler = Callable[[str, int | None, Any], Awaitable[None]]


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class MqttService:
    def __init__(self, config: AppConfig, loop: asyncio.AbstractEventLoop) -> None:
        self.config = config
        self.loop = loop
        self.enabled = bool(config.mqtt.broker)
        self.topics: TopicBuilder | None = None
        # Set while simulated hardware is being driven; stamps every payload.
        self.simulated = False
        self.sequence = SequenceCounter()
        client_id = config.mqtt.client_id or f"edge-{config.site.id}"
        try:
            self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=client_id, clean_session=True)
        except (AttributeError, TypeError):
            self.client = mqtt.Client(client_id=client_id, clean_session=True)
        if config.mqtt.username:
            password = config.mqtt.password.get_secret_value() if config.mqtt.password else None
            self.client.username_pw_set(config.mqtt.username, password)
        if config.mqtt.tls.enabled:
            # Server certificate verification stays on (paho's default CERT_REQUIRED).
            self.client.tls_set(
                ca_certs=config.mqtt.tls.ca_file,
                certfile=config.mqtt.tls.cert_file,
                keyfile=config.mqtt.tls.key_file,
            )
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message
        self.connected = False
        # Messages produced while disconnected or before the topic prefix is known:
        # (suffix, lane_number, encoded payload, qos, retain). Topics are resolved at send time.
        self.buffer: deque[tuple[str, int | None, str, int, bool]] = deque(maxlen=config.mqtt.memory_buffer_limit)
        self.command_handler: CommandHandler | None = None

    def set_topic_prefix(self, prefix: str) -> None:
        topics = TopicBuilder(prefix)
        previous = self.topics
        if previous is not None and previous.prefix == topics.prefix:
            return
        self.topics = topics
        LOGGER.info("MQTT topic prefix: %s", topics.prefix)
        if self.connected:
            if previous is not None:
                self.client.unsubscribe(previous.gate_command_filter())
            self.client.subscribe(topics.gate_command_filter(), qos=1)
            self._flush()

    def start(self) -> None:
        if not self.enabled:
            LOGGER.warning("No MQTT broker configured; MQTT publishing is disabled")
            return
        self.client.reconnect_delay_set(min_delay=1, max_delay=60)
        self.client.connect_async(self.config.mqtt.broker, self.config.mqtt.port, self.config.mqtt.keepalive)
        self.client.loop_start()

    def stop(self) -> None:
        if not self.enabled:
            return
        self.client.loop_stop()
        self.client.disconnect()

    def _on_connect(self, client: mqtt.Client, userdata: object, flags: object, reason_code: object, properties: object = None) -> None:
        if getattr(reason_code, "is_failure", False) or (isinstance(reason_code, int) and reason_code != 0):
            self.connected = False
            LOGGER.error("MQTT broker %s:%s refused the connection: %s", self.config.mqtt.broker, self.config.mqtt.port, reason_code)
            return
        self.connected = True
        LOGGER.info("Connected to MQTT broker %s:%s", self.config.mqtt.broker, self.config.mqtt.port)
        if self.topics is not None:
            client.subscribe(self.topics.gate_command_filter(), qos=1)
        self._flush()

    def _on_disconnect(self, client: mqtt.Client, userdata: object, *args: object) -> None:
        self.connected = False
        LOGGER.warning("MQTT disconnected; messages will be buffered")

    def _on_message(self, client: mqtt.Client, userdata: object, message: mqtt.MQTTMessage) -> None:
        handler = self.command_handler
        if handler is None or self.topics is None:
            return
        lane_number = self.topics.parse_gate_command_lane(message.topic)
        try:
            payload = json.loads(message.payload.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            LOGGER.warning("Rejected MQTT command on %s: invalid JSON (%s)", message.topic, error)
            return
        # Validation (schema, lane, ts, seq) runs on the event loop so replay tracking
        # is never touched from two threads.
        asyncio.run_coroutine_threadsafe(handler(message.topic, lane_number, payload), self.loop)

    def stamp(self, suffix: str, payload: dict[str, Any], lane_number: int | None = None) -> dict[str, Any]:
        message = dict(payload)
        message["ts"] = utc_timestamp()
        message["seq"] = self.sequence.next(suffix if lane_number is None else f"lane/{lane_number}/{suffix}")
        message["message_id"] = str(uuid4())
        if lane_number is not None:
            message["lane_number"] = lane_number
        if self.simulated:
            message["simulated"] = True
        return message

    def publish(self, suffix: str, payload: dict[str, Any], qos: int = 0, retain: bool = False, lane_number: int | None = None) -> None:
        known = LANE_SUFFIXES if lane_number is not None else SITE_SUFFIXES
        if suffix not in known:
            # A programming error, but publishing must never break weighing.
            LOGGER.error("Dropped MQTT message for unknown topic %r (lane %s)", suffix, lane_number)
            return
        if not self.enabled:
            return
        encoded = json.dumps(self.stamp(suffix, payload, lane_number), separators=(",", ":"), default=str)
        if not self.connected or self.topics is None:
            self.buffer.append((suffix, lane_number, encoded, qos, retain))
            return
        self._send(suffix, lane_number, encoded, qos, retain)

    def _send(self, suffix: str, lane_number: int | None, encoded: str, qos: int, retain: bool) -> bool:
        assert self.topics is not None
        result = self.client.publish(self.topics.topic(suffix, lane_number), encoded, qos=qos, retain=retain)
        if result.rc == mqtt.MQTT_ERR_SUCCESS:
            return True
        # paho keeps QoS>0 messages it could not send and redelivers them after the
        # reconnect; buffering them here as well would publish them twice.
        if result.rc == mqtt.MQTT_ERR_NO_CONN and qos > 0:
            return True
        self.buffer.append((suffix, lane_number, encoded, qos, retain))
        return False

    def _flush(self) -> None:
        if self.topics is None:
            return
        for _ in range(len(self.buffer)):
            if not self.connected:
                return
            try:
                item = self.buffer.popleft()
            except IndexError:
                return
            if not self._send(*item):
                return
