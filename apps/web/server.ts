import { createServer } from "node:http";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

import next from "next";
import { Server as SocketIOServer } from "socket.io";
import mqtt from "mqtt";
import { HardwareHealth } from "@prisma/client";
import { prisma } from "./src/lib/prisma";
import { siteIdentifierWhere } from "./src/lib/utils";
import { logger } from "./src/lib/logger";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

async function main() {
  await app.prepare();

  const server = createServer((request, response) => handler(request, response));
  const io = new SocketIOServer(server, {
    cors: { origin: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000", credentials: true },
  });

  io.on("connection", (socket) => {
    const siteId = typeof socket.handshake.auth.siteId === "string" ? socket.handshake.auth.siteId : null;
    const userId = typeof socket.handshake.auth.userId === "string" ? socket.handshake.auth.userId : null;
    if (siteId) socket.join(`site:${siteId}`);
    if (userId) socket.join(`user:${userId}`);
    logger.debug("socket_connected", { socket_id: socket.id, site_id: siteId, has_user: Boolean(userId) });
    socket.on("disconnect", (reason) => logger.debug("socket_disconnected", { socket_id: socket.id, reason }));
  });

  const broker = mqtt.connect(process.env.MQTT_URL ?? "mqtt://localhost:1883", { reconnectPeriod: 2_000 });
  broker.on("connect", () => {
    logger.info("mqtt_connected", { broker: process.env.MQTT_URL ?? "mqtt://localhost:1883" });
    broker.subscribe(["weighbridge/+/telemetry", "weighbridge/+/state", "weighbridge/+/transaction", "weighbridge/+/alerts", "weighbridge/+/hardware/status", "weighbridge/+/queue", "dashboard/+/notifications", "sync/+/status"]);
  });
  broker.on("reconnect", () => logger.warn("mqtt_reconnecting"));
  broker.on("close", () => logger.warn("mqtt_disconnected"));
  broker.on("error", (error) => logger.error("mqtt_client_error", { error: String(error) }));
  
  const lastHardwarePersist = new Map<string, { at: number; health: string }>();

  broker.on("message", async (topic, raw) => {
    try {
      const message = JSON.parse(raw.toString());
      const parts = topic.split("/");
      if (parts[0] === "dashboard") {
        io.to(`user:${parts[1]}`).emit("notification", message);
        return;
      }
      if (parts[0] === "sync") {
        io.to(`site:${parts[1]}`).emit("sync", message);
        return;
      }
      const siteId = parts[1];
      if (!siteId) return;
      const event = parts.slice(2).join(":");
      io.to(`site:${siteId}`).emit(event, message);

      if (event === "hardware:status") {
        const payload = message.payload ?? {};
        const health = Object.values(HardwareHealth).includes(payload.health as HardwareHealth) ? payload.health as HardwareHealth : HardwareHealth.DEGRADED;
        // Keyed by site+lane, not just site — a DUAL_ENTRY_EXIT site's daemon emits one
        // heartbeat per lane roughly simultaneously; a site-only key would let the second
        // lane's heartbeat silently starve the first one out of this throttle map.
        const dedupeKey = `${siteId}:${message.lane_number ?? "default"}`;
        const previous = lastHardwarePersist.get(dedupeKey);
        const now = Date.now();
        if (!previous || previous.health !== health || now - previous.at >= 60_000) {
          const site = await prisma.site.findFirst({ where: siteIdentifierWhere(siteId) });
          if (site) {
            await prisma.hardwareStatus.create({ data: {
              siteId: site.id,
              health,
              lastSeen: message.timestamp_utc ? new Date(message.timestamp_utc) : new Date(),
              sensorReadings: { state: payload.state ?? null, corrupt_frames: payload.corrupt_frames ?? 0, last_seen: payload.last_seen ?? null, lane: payload.lane ?? null, lane_number: message.lane_number ?? null },
              connectivity: { serial_connected: Boolean(payload.serial_connected), mqtt_connected: Boolean(payload.mqtt_connected), cloud_connected: Boolean(payload.cloud_connected) },
              message: health === "ONLINE" ? "Edge heartbeat" : "Edge heartbeat reports degraded connectivity",
            } });
            lastHardwarePersist.set(dedupeKey, { at: now, health });
            if (health !== "ONLINE" && (!previous || previous.health === "ONLINE")) {
              logger.warn("hardware_disconnected", { site_id: siteId, site_code: site.code, lane: payload.lane ?? null, health, serial_connected: Boolean(payload.serial_connected) });
            } else if (health === "ONLINE" && previous && previous.health !== "ONLINE") {
              logger.info("hardware_reconnected", { site_id: siteId, site_code: site.code, lane: payload.lane ?? null });
            }
          }
        }
      }
    } catch (error) {
      logger.error("mqtt_message_invalid_json", { topic, error: String(error) });
    }
  });

  server.listen(port, hostname, () => logger.info("web_server_listening", { hostname, port }));

  const shutdown = async (signal: string) => {
    logger.info("web_server_shutdown_start", { signal });
    broker.end();
    io.close();
    server.close(() => {
      logger.info("web_server_http_closed");
      prisma.$disconnect().then(() => {
        logger.info("web_server_database_disconnected");
        process.exit(0);
      });
    });
    setTimeout(() => {
      logger.error("web_server_shutdown_timeout_forced");
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.error("web_server_start_failed", { error: String(error) });
  process.exitCode = 1;
});
