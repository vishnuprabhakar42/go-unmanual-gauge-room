"use client";

import { Check, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { approvePoAction, poStatusAction, sendPoAction } from "../../actions";

export function PoActions({ id, status, canApprove }: { id: string; status: string; canApprove: boolean }) {
  const t = useTranslations("pos");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error);
      else toast.success(success);
    });
  return (
    <>
      {canApprove && (status === "DRAFT" || status === "PENDING_APPROVAL") && (
        <Button className="h-10" disabled={pending} onClick={() => run(() => approvePoAction({ id }), t("approvedMsg"))}>
          <Check className="size-4" />
          {t("approve")}
        </Button>
      )}
      {status === "APPROVED" && (
        <Button
          className="h-10"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await sendPoAction({ id });
              if (!res.ok) return void toast.error(res.error);
              toast.success(t("sent", { count: res.data.emailed }));
            })
          }
        >
          <Send className="size-4" />
          {t("send")}
        </Button>
      )}
      {status === "SENT" && (
        <Button
          variant="outline"
          className="h-10"
          disabled={pending}
          onClick={() => run(() => poStatusAction({ id, to: "ACKNOWLEDGED" }), t("acknowledge"))}
        >
          {t("acknowledge")}
        </Button>
      )}
      {["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(status) && (
        <Button
          variant="ghost"
          className="h-10"
          disabled={pending}
          onClick={() => {
            if (window.confirm(t("cancel") + "?")) run(() => poStatusAction({ id, to: "CANCELLED" }), t("cancel"));
          }}
        >
          {t("cancel")}
        </Button>
      )}
    </>
  );
}
