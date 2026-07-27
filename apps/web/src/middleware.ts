import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

// Deliberately built from the edge-safe authConfig (no providers, no Prisma,
// no bcrypt) rather than importing the full auth.ts — see auth.config.ts.
const { auth } = NextAuth(authConfig);

export default auth((request) => {
  const path = request.nextUrl.pathname;
  const siteCallable =
    path === "/api/health" ||
    path === "/api/bookings/active" ||
    path === "/api/bookings/queue" ||
    path === "/api/transactions/reconcile" ||
    path === "/api/transactions/chain-head" ||
    (path === "/api/incidents" && request.method === "POST");

  const publiclyReachable =
    path.startsWith("/login") ||
    path.startsWith("/apply") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/reset-password") ||
    path === "/api/transporters/apply" ||
    path === "/api/auth/forgot-password" ||
    path === "/api/auth/reset-password" ||
    path.startsWith("/api/auth") ||
    path.startsWith("/_next") ||
    path.startsWith("/verify/") ||
    siteCallable;

  if (publiclyReachable) {
    return NextResponse.next();
  }
  if (!request.auth?.user) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ success: false, data: null, error: "Authentication required" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const role = request.auth.user.role;
  if (path.startsWith("/admin") && role !== "ADMIN") return NextResponse.redirect(new URL("/", request.url));
  if (path.startsWith("/operator") && !["ADMIN", "OPERATOR", "SECURITY"].includes(role)) return NextResponse.redirect(new URL("/", request.url));
  if (path.startsWith("/kiosk") && !["ADMIN", "OPERATOR", "SECURITY"].includes(role)) return NextResponse.redirect(new URL("/", request.url));
  if (path.startsWith("/transporter") && !["ADMIN", "TRANSPORTER"].includes(role)) return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
});

export const config = { matcher: ["/((?!.*\\..*).*)"] };
