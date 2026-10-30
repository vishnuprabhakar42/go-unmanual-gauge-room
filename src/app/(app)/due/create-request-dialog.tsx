"use client";

import { ClipboardPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { createRequestsAction } from "../requests/actions";

export function CreateRequestButton({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const t = useTranslations("duePlanning");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();

  const create = () =>
    start(async () => {
      const res = await createRequestsAction({ instrumentIds: ids, notes });
      if (!res.ok) return void toast.error(res.error);
      const { requests, skipped } = res.data;
      if (skipped.length) {
        toast.warning(
          t("skipped", {
            count: skipped.length,
            details: skipped
              .slice(0, 3)
              .map((s) => `${s.code} (${s.reason})`)
              .join(", "),
          }),
        );
      }
      if (!requests.length) return void toast.error(t("noneCreated"));
      toast.success(t("created", { count: requests.length, numbers: requests.map((r) => r.number).join(", ") }));
      setOpen(false);
      onDone();
      router.push(requests.length === 1 ? `/requests/${requests[0].id}` : "/requests");
    });

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} data-testid="create-request">
        <ClipboardPlus className="size-4" />
        {t("createRequest")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmTitle")}</DialogTitle>
            <DialogDescription>{t("confirmBody", { count: ids.length })}</DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("notesPlaceholder")}
            aria-label={t("notesPlaceholder")}
          />
          <DialogFooter>
            <Button onClick={create} disabled={pending}>
              {pending ? t("creating") : t("createRequest")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
