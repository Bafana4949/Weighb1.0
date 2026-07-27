import mqtt, { type MqttClient } from "mqtt";

let client: MqttClient | undefined;

export function mqttClient(): MqttClient {
  if (!client) client = mqtt.connect(process.env.MQTT_URL ?? "mqtt://localhost:1883", { reconnectPeriod: 2_000 });
  return client;
}

export function publishJson(topic: string, value: unknown, qos: 0 | 1 = 1): Promise<void> {
  return new Promise((resolve, reject) => {
    mqttClient().publish(topic, JSON.stringify(value), { qos }, (error) => error ? reject(error) : resolve());
  });
}
