"use client";

import { Ban, PackageCheck, Stamp, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR } from "@/domain/india/format";
import { cancelChallanAction, dispatchChallanAction, issueChallanAction, receiveItemsAction } from "../../actions";

const MODES = ["BY_HAND", "COURIER", "VEHICLE", "VENDOR_PICKUP"] as const;

export function ChallanActions({
  id,
  number,
  status,
  dispatched,
}: {
  id: string;
  number: string;
  status: string;
  dispatched: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    transportMode: "BY_HAND" as (typeof MODES)[number],
    vehicleNo: "",
    courierName: "",
    awbNo: "",
    ewayBillNo: "",
    expectedReturnAt: "",
  });

  const issue = () =>
    start(async () => {
      const res = await issueChallanAction({ id });
      if (!res.ok) return void toast.error(res.error);
      toast.success(t("dispatch.issued", { number: res.data.number }));
      router.refresh();
    });
  const dispatch = () =>
    start(async () => {
      const res = await dispatchChallanAction({ id, ...form });
      if (!res.ok) return void toast.error(res.error);
      toast.success(t("dispatch.dispatched", { gp: res.data.gatePassNo }));
      setOpen(false);
      router.refresh();
    });

  return (
    <>
      {status === "DRAFT" && (
        <Button className="h-10" disabled={pending} onClick={issue} data-testid="issue-challan">
          <Stamp className="size-4" />
          {t("dispatch.issue")}
        </Button>
      )}
      {status === "ISSUED" && !dispatched && (
        <Button className="h-10" disabled={pending} onClick={() => setOpen(true)} data-testid="dispatch-challan">
          <Truck className="size-4" />
          {t("dispatch.dispatch")}
        </Button>
      )}
      {(status === "DRAFT" || (status === "ISSUED" && !dispatched)) && (
        <Button
          variant="ghost"
          className="h-10"
          disabled={pending}
          onClick={() =>
            window.confirm(t("dispatch.cancelConfirm")) &&
            start(async () => {
              const res = await cancelChallanAction({ id });
              if (!res.ok) return void toast.error(res.error);
              toast.success(t("dispatch.cancelled"));
              router.refresh();
            })
          }
        >
          <Ban className="size-4" />
          {t("dispatch.cancel")}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dispatch.dispatchTitle", { number })}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("dispatch.transportMode")} htmlFor="mode" className="sm:col-span-2">
              <Select
                value={form.transportMode}
                onValueChange={(v) => setForm({ ...form, transportMode: v as (typeof MODES)[number] })}
              >
                <SelectTrigger id="mode" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {t(`transport.${m}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {form.transportMode === "VEHICLE" && (
              <Field label={t("dispatch.vehicleNo")} htmlFor="vehicleNo" className="sm:col-span-2">
                <Input
                  id="vehicleNo"
                  className="h-11 uppercase"
                  placeholder="MH12AB1234"
                  value={form.vehicleNo}
                  onChange={(e) => setForm({ ...form, vehicleNo: e.target.value })}
                />
              </Field>
            )}
            {form.transportMode === "COURIER" && (
              <>
                <Field label={t("dispatch.courierName")} htmlFor="courier">
                  <Input
                    id="courier"
                    className="h-11"
                    value={form.courierName}
                    onChange={(e) => setForm({ ...form, courierName: e.target.value })}
                  />
                </Field>
                <Field label={t("dispatch.awbNo")} htmlFor="awb">
                  <Input
                    id="awb"
                    className="h-11"
                    value={form.awbNo}
                    onChange={(e) => setForm({ ...form, awbNo: e.target.value })}
                  />
                </Field>
              </>
            )}
            <Field label={t("dispatch.ewayBillNo")} htmlFor="ewb" optional hint={t("dispatch.ewayHint")}>
              <Input
                id="ewb"
                inputMode="numeric"
                maxLength={12}
                className="h-11"
                value={form.ewayBillNo}
                onChange={(e) => setForm({ ...form, ewayBillNo: e.target.value })}
              />
            </Field>
            <Field label={t("dispatch.expectedReturn")} htmlFor="eta" optional hint={t("dispatch.expectedReturnHint")}>
              <Input
                id="eta"
                type="date"
                className="h-11"
                value={form.expectedReturnAt}
                onChange={(e) => setForm({ ...form, expectedReturnAt: e.target.value })}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button onClick={dispatch} disabled={pending} data-testid="confirm-dispatch">
              {t("dispatch.dispatch")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type Row = {
  id: string;
  code: string;
  instrumentId: string;
  description: string;
  hsnCode: string | null;
  value: number;
  returnedAt: string | null;
  remarks: string | null;
  status: React.ReactNode;
};

export function ReceiveTable({
  challanId,
  items,
  canReceive,
  total,
}: {
  challanId: string;
  items: Row[];
  canReceive: boolean;
  total: string;
}) {
  const t = useTranslations("dispatch");
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [remarks, setRemarks] = useState("");
  const [pending, start] = useTransition();
  const pending_ = items.filter((i) => !i.returnedAt);

  const receive = () =>
    start(async () => {
      const res = await receiveItemsAction({ challanId, itemIds: [...selected], remarks });
      if (!res.ok) return void toast.error(res.error);
      toast.success(t("receivedMsg", { count: res.data.received }));
      setSelected(new Set());
      setRemarks("");
      router.refresh();
    });

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="challan-items">
          <TableHeader>
            <TableRow>
              {canReceive && (
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Select all pending"
                    checked={pending_.length > 0 && pending_.every((i) => selected.has(i.id))}
                    onCheckedChange={(v) => setSelected(v === true ? new Set(pending_.map((i) => i.id)) : new Set())}
                  />
                </TableHead>
              )}
              <TableHead>{t("code")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("description")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("hsn")}</TableHead>
              <TableHead className="text-right">{t("value")}</TableHead>
              <TableHead>{t("returned")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((i) => (
              <TableRow key={i.id}>
                {canReceive && (
                  <TableCell>
                    {!i.returnedAt && (
                      <Checkbox
                        aria-label={`Receive ${i.code}`}
                        checked={selected.has(i.id)}
                        onCheckedChange={(v) =>
                          setSelected((s) => {
                            const n = new Set(s);
                            if (v === true) n.add(i.id);
                            else n.delete(i.id);
                            return n;
                          })
                        }
                      />
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <Link href={`/instruments/${i.instrumentId}`} className="font-mono underline-offset-4 hover:underline">
                    {i.code}
                  </Link>
                  <div className="mt-1">{i.status}</div>
                </TableCell>
                <TableCell className="hidden md:table-cell">{i.description}</TableCell>
                <TableCell className="hidden font-mono text-xs sm:table-cell">{i.hsnCode ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(i.value)}</TableCell>
                <TableCell className="text-sm">
                  {i.returnedAt ? (
                    t("returnedOn", { date: i.returnedAt })
                  ) : (
                    <span className="text-muted-foreground">{t("pending")}</span>
                  )}
                  {i.remarks && <div className="text-muted-foreground text-xs">{i.remarks}</div>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex justify-end text-sm">
        <span className="text-muted-foreground mr-2">{t("totalValue")}:</span>
        <span className="font-semibold tabular-nums">{total}</span>
      </div>
      {canReceive && pending_.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label={t("receiveRemarks")} htmlFor="receive-remarks" optional className="flex-1">
            <Input id="receive-remarks" className="h-11" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
          <Button className="h-11" disabled={pending || selected.size === 0} onClick={receive} data-testid="receive-selected">
            <PackageCheck className="size-4" />
            {t("receiveSelected")} ({selected.size})
          </Button>
        </div>
      )}
    </div>
  );
}
