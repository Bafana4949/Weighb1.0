import Link from "next/link";
import { Button } from "@/components/ui/button";

export function PaginationControls({ page, limit, total, basePath, params, pageParam = "page" }: { page: number; limit: number; total: number; basePath: string; params: Record<string, string | undefined>; pageParam?: string }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  function href(target: number) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
    query.set(pageParam, String(target));
    return `${basePath}?${query.toString()}`;
  }
  return <div className="flex items-center justify-between text-xs text-muted-foreground">
    <p>{total.toLocaleString()} result{total === 1 ? "" : "s"} · page {page} of {totalPages}</p>
    <div className="flex gap-1.5">
      <Link href={href(Math.max(1, page - 1))} aria-disabled={page <= 1}><Button type="button" variant="outline" size="sm" disabled={page <= 1}>Previous</Button></Link>
      <Link href={href(Math.min(totalPages, page + 1))} aria-disabled={page >= totalPages}><Button type="button" variant="outline" size="sm" disabled={page >= totalPages}>Next</Button></Link>
    </div>
  </div>;
}
