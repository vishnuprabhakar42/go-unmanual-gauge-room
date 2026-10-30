import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/domain/india/format";
import { nablState } from "@/domain/vendor-selection";

/** NABL validity with status: expired (critical), expiring within 60 days (warning), valid. Icon-free text label carries the meaning. */
export async function NablBadge({ type, validUntil }: { type: "NABL" | "OEM" | "OTHER"; validUntil: Date | null }) {
  const t = await getTranslations();
  if (type !== "NABL") return <Badge variant="outline">{t(`accreditation.${type}`)}</Badge>;
  const state = nablState(validUntil);
  if (state === "EXPIRED")
    return <Badge className="border-0 bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">{t("vendors.expired")}</Badge>;
  if (state === "EXPIRING")
    return (
      <Badge className="border-0 bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100">
        {t("vendors.expiring", { date: formatDate(validUntil) })}
      </Badge>
    );
  return <Badge variant="outline">{t("vendors.validUntil", { date: formatDate(validUntil!) })}</Badge>;
}
