import * as React from "react";
import { cn } from "@/lib/utils";
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) { return <div className="w-full overflow-auto"><table className={cn("w-full caption-bottom text-sm", className)} {...props} /></div>; }
export function TableHeader(props: React.HTMLAttributes<HTMLTableSectionElement>) { return <thead className="border-b border-border" {...props} />; }
export function TableBody(props: React.HTMLAttributes<HTMLTableSectionElement>) { return <tbody className="divide-y divide-border" {...props} />; }
export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) { return <tr className={cn("transition-colors hover:bg-muted", className)} {...props} />; }
export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) { return <th className={cn("h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-wider text-muted-foreground", className)} {...props} />; }
export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) { return <td className={cn("h-9 px-3 align-middle text-foreground", className)} {...props} />; }
