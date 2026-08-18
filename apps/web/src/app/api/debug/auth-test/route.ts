import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email") || "admin@weighbridge.local";
  const password = url.searchParams.get("password") || "Password123!";

  const diagnostics: Record<string, any> = {
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    databaseUrlHost: process.env.DATABASE_URL ? process.env.DATABASE_URL.split("@")[1] : null,
    hasAuthSecret: !!process.env.AUTH_SECRET,
    hasDirectUrl: !!process.env.DIRECT_URL,
    nodeEnv: process.env.NODE_ENV,
    queriedEmail: email,
  };

  try {
    const userCount = await prisma.user.count();
    diagnostics.totalUsersInDatabase = userCount;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      diagnostics.userFound = false;
      diagnostics.error = "User not found in database";
      return NextResponse.json(diagnostics, { status: 200 });
    }

    diagnostics.userFound = true;
    diagnostics.userStatus = user.status;
    diagnostics.userRole = user.role;
    diagnostics.hasPasswordHash = !!user.passwordHash;

    const passwordMatch = await bcrypt.compare(password.trim(), user.passwordHash);
    diagnostics.passwordMatch = passwordMatch;

    return NextResponse.json(diagnostics, { status: 200 });
  } catch (err: any) {
    diagnostics.dbError = err?.message || String(err);
    diagnostics.dbErrorCode = err?.code || null;
    return NextResponse.json(diagnostics, { status: 500 });
  }
}
