"use client";

import { Ban, Check, PackageCheck, RefreshCw, Send, Undo2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  approveRequestAction,
  cancelRequestAction,
  reassignAction,
  releaseRequestAction,
  removeRequestItemAction,
  sendBackRequestAction,
  setItemSourcingAction,
  submitRequestAction,
  updateRequestNotesAction,
} from "../actions";

export function RequestWorkflow({
  id,
  number,
  status,
  can,
}: {
  id: string;
  number: string;
  status: string;
  can: { edit: boolean; approve: boolean; release: boolean };
}) {
  const t = useTranslations("requests");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [backOpen, setBackOpen] = useState(false);
  const [reason, setReason] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error);
      toast.success(msg);
      router.refresh();
    });

  const release = () =>
    start(async () => {
      const res = await releaseRequestAction({ id });
      if (!res.ok) return void toast.error(res.error);
      toast.success(t("released", { pos: res.data.purchaseOrders.length, rfq: res.data.rfq?.number ?? "none" }));
      router.refresh();
    });

  return (
    <div className="flex flex-wrap gap-2">
      {status === "DRAFT" && can.edit && (
        <>
          <Button
            variant="outline"
            className="h-10"
            disabled={pending}
            onClick={() => run(() => reassignAction({ id }), t("reassign"))}
          >
            <RefreshCw className="size-4" />
            {t("reassign")}
          </Button>
          <Button
            className="h-10"
            disabled={pending}
            onClick={() => run(() => submitRequestAction({ id }), t("submitted"))}
            data-testid="submit-request"
          >
            <Send className="size-4" />
            {t("submit")}
          </Button>
        </>
      )}
      {status === "SUBMITTED" && can.approve && (
        <>
          <Button
            className="h-10"
            disabled={pending}
            onClick={() => run(() => approveRequestAction({ id }), t("approved"))}
            data-testid="approve-request"
          >
            <Check className="size-4" />
            {t("approve")}
          </Button>
          <Button variant="outline" className="h-10" disabled={pending} onClick={() => setBackOpen(true)}>
            <Undo2 className="size-4" />
            {t("sendBack")}
          </Button>
        </>
      )}
      {status === "APPROVED" && can.release && (
        <Button className="h-10" disabled={pending} onClick={release} data-testid="release-request">
          <PackageCheck className="size-4" />
          {t("release")}
        </Button>
      )}
      {["DRAFT", "SUBMITTED", "APPROVED"].includes(status) && (can.edit || can.approve) && (
        <Button
          variant="ghost"
          className="h-10"
          disabled={pending}
          onClick={() => {
            if (window.confirm(t("cancelConfirm", { number }))) run(() => cancelRequestAction({ id }), t("cancelled"));
          }}
        >
          <Ban className="size-4" />
          {t("cancel")}
        </Button>
      )}
      <Dialog open={backOpen} onOpenChange={setBackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("sendBack")}</DialogTitle>
          </DialogHeader>
          <Label htmlFor="back-reason">{t("sendBackReason")}</Label>
          <Textarea id="back-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button
              disabled={pending || reason.trim().length < 3}
              onClick={() => {
                setBackOpen(false);
                run(() => sendBackRequestAction({ id, reason }), t("sendBack"));
              }}
            >
              {t("sendBack")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SourcingSelect({
  requestId,
  itemId,
  value,
  options,
  code,
}: {
  requestId: string;
  itemId: string;
  value: string;
  options: { value: string; label: string }[];
  code: string;
}) {
  const t = useTranslations("requests");
  const [pending, start] = useTransition();
  return (
    <Select
      value={value}
      disabled={pending}
      onValueChange={(v) =>
        start(async () => {
          const res = await setItemSourcingAction({ requestId, itemId, choice: v === "RFQ" ? "RFQ" : { rateContractItemId: v } });
          if (!res.ok) toast.error(res.error);
        })
      }
    >
      <SelectTrigger className="h-9 w-full min-w-52" aria-label={`${t("vendor")} ${code}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
        <SelectItem value="RFQ">{t("sourcingRfq")}</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function RemoveItemButton({ itemId, requestId, code }: { itemId: string; requestId: string; code: string }) {
  const t = useTranslations("requests");
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label={`${t("remove")} ${code}`}
      onClick={() => {
        if (!window.confirm(t("removeConfirm", { code }))) return;
        start(async () => {
          const res = await removeRequestItemAction({ itemId, requestId });
          if (!res.ok) toast.error(res.error);
        });
      }}
    >
      <X className="size-4" />
      {t("remove")}
    </Button>
  );
}

export function RequestNotes({ id, notes, editable }: { id: string; notes: string; editable: boolean }) {
  const t = useTranslations();
  const [value, setValue] = useState(notes);
  const [pending, start] = useTransition();
  if (!editable) return notes ? <p className="text-sm whitespace-pre-wrap">{notes}</p> : null;
  return (
    <div className="space-y-2">
      <Label htmlFor="req-notes">{t("requests.notes")}</Label>
      <Textarea id="req-notes" rows={2} value={value} onChange={(e) => setValue(e.target.value)} />
      <Button
        size="sm"
        variant="outline"
        disabled={pending || value === notes}
        onClick={() =>
          start(async () => {
            const res = await updateRequestNotesAction({ id, notes: value });
            if (res.ok) toast.success(t("common.saved"));
            else toast.error(res.error);
          })
        }
      >
        {t("requests.saveNotes")}
      </Button>
    </div>
  );
}
