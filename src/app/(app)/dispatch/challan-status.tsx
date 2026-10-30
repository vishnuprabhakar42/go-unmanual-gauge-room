import { getTranslations } from "next-intl/server";
import { StatusPill, type Tone } from "@/components/data/status-pill";

const TONE: Record<string, Tone> = {
  DRAFT: "neutral",
  ISSUED: "info",
  PARTIALLY_RETURNED: "warning",
  RETURNED: "success",
  CANCELLED: "muted",
};

export async function ChallanStatus({ status, dispatched }: { status: string; dispatched: boolean }) {
  const t = await getTranslations();
  const label =
    status === "ISSUED" && dispatched
      ? `${t("challanStatus.ISSUED")} · ${t("dispatch.dispatchedAt").toLowerCase()}`
      : t(`challanStatus.${status}`);
  return <StatusPill label={label} tone={status === "ISSUED" && dispatched ? "violet" : TONE[status]} />;
}
