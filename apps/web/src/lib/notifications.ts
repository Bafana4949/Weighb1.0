import nodemailer from "nodemailer";
import { NotificationChannel, NotificationStatus, Prisma, Severity, UserRole } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { publishJson } from "@/lib/mqtt";

const routes: Record<string, { roles: UserRole[]; channels: NotificationChannel[] }> = {
  UNAUTHORISED_ACCESS: { roles: [UserRole.OPERATOR, UserRole.SECURITY, UserRole.ADMIN], channels: [NotificationChannel.DASHBOARD, NotificationChannel.SMS, NotificationChannel.EMAIL] },
  OVERLOAD: { roles: [UserRole.OPERATOR, UserRole.TRANSPORTER], channels: [NotificationChannel.DASHBOARD, NotificationChannel.EMAIL] },
  DRIVER_MISMATCH: { roles: [UserRole.ADMIN, UserRole.SECURITY], channels: [NotificationChannel.DASHBOARD, NotificationChannel.SMS, NotificationChannel.EMAIL, NotificationChannel.AUDIBLE] },
  CLOUD_SYNC_FAILURE: { roles: [UserRole.ADMIN], channels: [NotificationChannel.DASHBOARD] },
  SENSOR_FAULT: { roles: [UserRole.ADMIN, UserRole.OPERATOR], channels: [NotificationChannel.DASHBOARD, NotificationChannel.SMS] },
  BOOKING_APPROVED: { roles: [UserRole.TRANSPORTER], channels: [NotificationChannel.EMAIL, NotificationChannel.DASHBOARD] },
  BOOKING_REJECTED: { roles: [UserRole.TRANSPORTER], channels: [NotificationChannel.EMAIL, NotificationChannel.DASHBOARD] },
  BOOKING_PENDING_REVIEW: { roles: [UserRole.ADMIN, UserRole.OPERATOR], channels: [NotificationChannel.DASHBOARD] },
  TRANSPORTER_APPROVED: { roles: [UserRole.TRANSPORTER], channels: [NotificationChannel.EMAIL, NotificationChannel.DASHBOARD] },
  COMPANY_ACTIVATED: { roles: [UserRole.ADMIN], channels: [NotificationChannel.EMAIL, NotificationChannel.DASHBOARD] },
  COMPANY_SUSPENDED: { roles: [UserRole.ADMIN], channels: [NotificationChannel.EMAIL, NotificationChannel.DASHBOARD] },
  SERVICE_ORDER_CREATED: { roles: [UserRole.ADMIN], channels: [NotificationChannel.DASHBOARD] },
  SERVICE_ORDER_ASSIGNED: { roles: [UserRole.ADMIN], channels: [NotificationChannel.DASHBOARD, NotificationChannel.EMAIL] },
  SERVICE_ORDER_COMMENT_ADDED: { roles: [UserRole.ADMIN], channels: [NotificationChannel.DASHBOARD] },
  SERVICE_ORDER_RESOLVED: { roles: [UserRole.ADMIN], channels: [NotificationChannel.DASHBOARD, NotificationChannel.EMAIL] },
  VEHICLE_ASSIGNMENT_CREATED: { roles: [UserRole.ADMIN, UserRole.TRANSPORTER], channels: [NotificationChannel.DASHBOARD, NotificationChannel.EMAIL] },
  TRANSACTION_COMPLETE: { roles: [UserRole.TRANSPORTER, UserRole.OPERATOR], channels: [NotificationChannel.DASHBOARD] },
  QUEUE_THRESHOLD: { roles: [UserRole.OPERATOR], channels: [NotificationChannel.DASHBOARD] },
};

function transporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
}

function smsConfigured() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}

async function sendSms(to: string, body: string): Promise<void> {
  if (!smsConfigured()) {
    console.log(`[SMS placeholder] to=${to} ${body}`);
    return;
  }
  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${accountSid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
    },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM_NUMBER!, Body: body }),
  });
  if (!response.ok) throw new Error(`Twilio SMS failed (${response.status}): ${await response.text()}`);
}

/**
 * Sends directly to a single, arbitrary email address rather than resolving
 * recipients from a role — for one-off flows like password reset that aren't
 * tied to the role-based routing table. Silently no-ops if SMTP isn't
 * configured (matches this environment, which only has placeholder creds).
 */
export async function sendDirectEmail(to: string, subject: string, body: string): Promise<boolean> {
  const mailer = transporter();
  if (!mailer) { console.log(`[EMAIL placeholder] to=${to} subject=${subject}\n${body}`); return false; }
  await mailer.sendMail({ from: process.env.SMTP_FROM, to, subject, text: body });
  return true;
}

export async function routeNotification(input: { event: string; severity: Severity; subject: string; body: string; organisationId?: string | null; metadata?: Record<string, unknown> }) {
  const route = routes[input.event] ?? { roles: [UserRole.ADMIN], channels: [NotificationChannel.DASHBOARD] };
  // A mining-company-scoped notification also reaches the platform super-admin
  // (organisationId === null), who oversees every company, while still going
  // to that company's own staff — never to a *different* company's admins.
  const users = await prisma.user.findMany({ where: { role: { in: route.roles }, status: "ACTIVE", ...(input.organisationId ? { OR: [{ organisationId: input.organisationId }, { organisationId: null }] } : {}) } });
  const mailer = transporter();
  for (const user of users) {
    for (const channel of route.channels) {
      const notification = await prisma.notification.create({ data: { userId: user.id, channel, severity: input.severity, subject: input.subject, body: input.body, metadata: (input.metadata ?? {}) as Prisma.InputJsonValue } });
      try {
        if (channel === NotificationChannel.DASHBOARD) {
          await publishJson(`dashboard/${user.id}/notifications`, { message_id: randomUUID(), site_id: String(input.metadata?.site_id ?? "cloud"), timestamp_utc: new Date().toISOString(), payload: { id: notification.id, severity: input.severity, subject: input.subject, body: input.body } });
        } else if (channel === NotificationChannel.EMAIL && mailer) {
          await mailer.sendMail({ from: process.env.SMTP_FROM, to: user.email, subject: input.subject, text: input.body });
        } else if (channel === NotificationChannel.SMS) {
          if (!user.phone) throw new Error("User has no phone number on file");
          await sendSms(user.phone, `${input.subject}: ${input.body}`);
        } else if (channel === NotificationChannel.AUDIBLE) {
          console.log(`[AUDIBLE ALARM] ${input.subject}: ${input.body}`);
        }
        await prisma.notification.update({ where: { id: notification.id }, data: { status: NotificationStatus.SENT, sentAt: new Date() } });
      } catch (error) {
        await prisma.notification.update({ where: { id: notification.id }, data: { status: NotificationStatus.FAILED, error: String(error) } });
      }
    }
  }
}
