"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled Application Error:", error);
  }, [error]);

  const isTenantError = error.message?.includes("Tenant scope") || error.name === "TenantScopeError";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle size={24} />
        </div>
        <h1 className="text-lg font-bold">
          {isTenantError ? "Tenant Scope Access Restricted" : "An Unexpected Error Occurred"}
        </h1>
        <p className="mt-2 text-xs text-muted-foreground">
          {isTenantError
            ? "Your account is not linked to an active client organization, or this resource is locked to another tenant."
            : error.message || "A technical error prevented this page from loading. Please try again or return to dashboard."}
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-2xs text-muted-foreground/60">
            Reference ID: {error.digest}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            onClick={() => reset()}
            className="flex items-center justify-center gap-1.5 rounded-sm bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
          >
            <RotateCcw size={14} />
            Try Again
          </button>
          <Link
            href="/"
            className="flex items-center justify-center gap-1.5 rounded-sm border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <Home size={14} />
            Return Home
          </Link>
        </div>
      </div>
    </main>
  );
}
