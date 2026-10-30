import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

/** Server-rendered pager driven by the `page` URL param. */
export async function Pagination({
  page,
  pageSize,
  total,
  searchParams,
  basePath,
}: {
  page: number;
  pageSize: number;
  total: number;
  searchParams: Record<string, string | undefined>;
  basePath: string;
}) {
  const t = await getTranslations("common");
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const q = new URLSearchParams(Object.entries(searchParams).filter((e): e is [string, string] => !!e[1]));
    q.set("page", String(p));
    return `${basePath}?${q.toString()}`;
  };
  return (
    <div className="flex items-center justify-between gap-2 pt-4 text-sm">
      <span className="text-muted-foreground">{t("results", { count: total })}</span>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground hidden sm:inline">{t("pageOf", { page, pages })}</span>
        <Button
          asChild
          variant="outline"
          size="sm"
          aria-disabled={page <= 1}
          className={page <= 1 ? "pointer-events-none opacity-50" : ""}
        >
          <Link href={href(Math.max(1, page - 1))}>{t("previous")}</Link>
        </Button>
        <Button
          asChild
          variant="outline"
          size="sm"
          aria-disabled={page >= pages}
          className={page >= pages ? "pointer-events-none opacity-50" : ""}
        >
          <Link href={href(Math.min(pages, page + 1))}>{t("next")}</Link>
        </Button>
      </div>
    </div>
  );
}

export function parsePage(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}
