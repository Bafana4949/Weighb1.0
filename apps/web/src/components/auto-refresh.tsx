"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

/** Re-renders the current server page every few seconds while the tab is visible. */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  // Set after mount so server and client render the same markup.
  const [at, setAt] = useState<Date | null>(null);
  useEffect(() => {
    setAt(new Date());
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setAt(new Date());
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return (
    <span className="flex items-center gap-1.5 text-2xs text-muted-foreground" aria-live="polite">
      <RefreshCw size={12} />Auto-refresh every {seconds}s · updated {at ? at.toLocaleTimeString("en-ZA", { timeZone: "Africa/Johannesburg", hour12: false }) : "—"}
    </span>
  );
}
