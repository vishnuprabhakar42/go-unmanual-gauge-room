"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { acknowledgePoAction } from "../../actions";

export function AcknowledgeButton({ poId }: { poId: string }) {
  const t = useTranslations("portal");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      className="h-10"
      disabled={pending}
      data-testid="acknowledge-po"
      onClick={() =>
        start(async () => {
          const res = await acknowledgePoAction({ poId });
          if (!res.ok) return void toast.error(res.error);
          toast.success(t("acknowledged"));
          router.refresh();
        })
      }
    >
      <Check className="size-4" />
      {t("acknowledge")}
    </Button>
  );
}
