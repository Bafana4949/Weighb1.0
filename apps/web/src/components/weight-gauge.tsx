"use client";
import { formatKg } from "@/lib/utils";

// The needle's pivot and sweep are derived from the arc path's own geometry
// (center + endpoints) below, rather than a separately hardcoded angle range,
// so the needle can never drift out of sync with where the track actually
// starts and ends.
const ARC = "M 40 151 A 75 75 0 1 1 160 151";
const CENTER = { x: 100, y: 106 };
const ARC_START = { x: 40, y: 151 };
const ARC_END = { x: 160, y: 151 };
const NEEDLE_LENGTH = 68;
const startAngle = Math.atan2(ARC_START.y - CENTER.y, ARC_START.x - CENTER.x);
const endAngleRaw = Math.atan2(ARC_END.y - CENTER.y, ARC_END.x - CENTER.x);
const endAngle = endAngleRaw < startAngle ? endAngleRaw + 2 * Math.PI : endAngleRaw;

export function WeightGauge({ weight, max = 80000, stable = false }: { weight: number; max?: number; stable?: boolean }) {
  const ratio = Math.min(1, Math.max(0, weight / max));
  const angle = startAngle + ratio * (endAngle - startAngle);
  const x = CENTER.x + Math.cos(angle) * NEEDLE_LENGTH;
  const y = CENTER.y + Math.sin(angle) * NEEDLE_LENGTH;
  return <div className="relative mx-auto aspect-square w-full max-w-[330px]"><svg viewBox="0 0 200 200" className="h-full w-full font-mono"><path d={ARC} fill="none" className="stroke-border" strokeWidth="14" strokeLinecap="round" /><path d={ARC} fill="none" className="stroke-primary" strokeWidth="14" strokeLinecap="round" pathLength="100" strokeDasharray={`${ratio * 100} 100`} /><line x1={CENTER.x} y1={CENTER.y} x2={x} y2={y} className="stroke-foreground transition-all duration-200" strokeWidth="3" strokeLinecap="round" /><circle cx={CENTER.x} cy={CENTER.y} r="7" className="fill-primary" /><text x="100" y="132" textAnchor="middle" className="fill-foreground" fontSize="16" fontWeight="700">{formatKg(weight)}</text><text x="100" y="150" textAnchor="middle" className={stable ? "fill-success" : "fill-muted-foreground"} fontSize="7" letterSpacing="1.5">{stable ? "STABLE" : "LIVE READING"}</text></svg></div>;
}
