import { Download } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Plain GET form: the period lives in the URL (?from&to), so reports are linkable and exports reuse it. */
export async function PeriodFilter({
  from,
  to,
  exportHref,
  plantLabel,
}: {
  from?: string;
  to?: string;
  exportHref: string;
  plantLabel: string;
}) {
  const t = await getTranslations("reports");
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      {from !== undefined ? (
        <form className="flex flex-wrap items-end gap-3" aria-label={t("period")}>
          <div className="space-y-1.5">
            <Label htmlFor="from">{t("from")}</Label>
            <Input id="from" name="from" type="date" defaultValue={from} className="h-11 w-44" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to">{t("to")}</Label>
            <Input id="to" name="to" type="date" defaultValue={to} className="h-11 w-44" />
          </div>
          <Button type="submit" variant="outline" className="h-11">
            {t("apply")}
          </Button>
        </form>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground text-sm">{t("plantNote", { plant: plantLabel })}</span>
        <Button asChild className="h-11">
          <a href={exportHref} data-testid="export">
            <Download aria-hidden="true" />
            {t("export")}
          </a>
        </Button>
      </div>
    </div>
  );
}
