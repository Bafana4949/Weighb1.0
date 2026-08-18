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
    path.startsWith("/api/debug") ||
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
    path.startsWith("/api/seed-rbac") ||
    path.startsWith("/_next") ||
    path.startsWith("/verify/") ||
    siteCallable;

  if (publiclyReachable) {
    const res = NextResponse.next();
    // Exclude static assets from being forced to no-store (they have their own headers via next.config)
    if (!path.startsWith("/_next")) {
      res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.headers.set('Pragma', 'no-cache');
      res.headers.set('Expires', '0');
    }
    return res;
  }
  if (!request.auth?.user) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ success: false, data: null, error: "Authentication required" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const role = request.auth.user.role;
  let response = NextResponse.next();

  if (path.startsWith("/admin") && role !== "ADMIN") response = NextResponse.redirect(new URL("/", request.url));
  else if (path.startsWith("/operator") && !["ADMIN", "OPERATOR", "SECURITY"].includes(role)) response = NextResponse.redirect(new URL("/", request.url));
  else if (path.startsWith("/kiosk") && !["ADMIN", "OPERATOR", "SECURITY"].includes(role)) response = NextResponse.redirect(new URL("/", request.url));
  else if (path.startsWith("/transporter") && !["ADMIN", "TRANSPORTER"].includes(role)) response = NextResponse.redirect(new URL("/", request.url));
  
  // Set headers to prevent caching of dynamic app shell HTML and RSC payloads
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  
  return response;
});

export const config = { matcher: ["/((?!.*\\..*).*)"] };
