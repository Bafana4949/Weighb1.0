import * as React from "react";
import { cn } from "@/lib/utils";
const styles = {
  default: "border-success/30 bg-success/10 text-success",
  muted: "border-border bg-muted text-muted-foreground",
  warning: "border-warning/30 bg-warning/10 text-warning",
  destructive: "border-danger/30 bg-danger/10 text-danger",
  info: "border-primary/30 bg-primary/10 text-primary",
};
export function Badge({ className, variant = "default", ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof styles }) { return <span className={cn("inline-flex items-center rounded-sm border px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide", styles[variant], className)} {...props} />; }
