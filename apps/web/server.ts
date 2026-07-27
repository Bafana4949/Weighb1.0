import { createServer } from "node:http";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import mqtt from "mqtt";
import { HardwareHealth } from "@prisma/client";
import { prisma } from "./src/lib/prisma";
import { siteIdentifierWhere } from "./src/lib/utils";

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
  });

  const broker = mqtt.connect(process.env.MQTT_URL ?? "mqtt://localhost:1883", { reconnectPeriod: 2_000 });
  broker.on("connect", () => {
    broker.subscribe(["weighbridge/+/telemetry", "weighbridge/+/state", "weighbridge/+/transaction", "weighbridge/+/alerts", "weighbridge/+/hardware/status", "weighbridge/+/queue", "dashboard/+/notifications", "sync/+/status"]);
  });
  
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
        const previous = lastHardwarePersist.get(siteId);
        const now = Date.now();
        if (!previous || previous.health !== health || now - previous.at >= 60_000) {
          const site = await prisma.site.findFirst({ where: siteIdentifierWhere(siteId) });
          if (site) {
            await prisma.hardwareStatus.create({ data: {
              siteId: site.id,
              health,
              lastSeen: message.timestamp_utc ? new Date(message.timestamp_utc) : new Date(),
              sensorReadings: { state: payload.state ?? null, corrupt_frames: payload.corrupt_frames ?? 0, last_seen: payload.last_seen ?? null },
              connectivity: { serial_connected: Boolean(payload.serial_connected), mqtt_connected: Boolean(payload.mqtt_connected), cloud_connected: Boolean(payload.cloud_connected) },
              message: health === "ONLINE" ? "Edge heartbeat" : "Edge heartbeat reports degraded connectivity",
            } });
            lastHardwarePersist.set(siteId, { at: now, health });
          }
        }
      }
    } catch (error) {
      console.error("Ignoring invalid MQTT JSON", topic, error);
    }
  });

  server.listen(port, hostname, () => console.log(`Weighbridge web listening on http://${hostname}:${port}`));

  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    broker.end();
    io.close();
    server.close(() => {
      console.log("HTTP server closed.");
      prisma.$disconnect().then(() => {
        console.log("Database disconnected.");
        process.exit(0);
      });
    });
    setTimeout(() => {
      console.error("Could not close connections in time, forcefully shutting down");
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error("Failed to start web server:", error);
  process.exitCode = 1;
});
