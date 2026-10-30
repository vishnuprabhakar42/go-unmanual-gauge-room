"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { StatusPill } from "@/components/data/status-pill";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { nextLabSteps } from "@/domain/lab-progress";
import type { LabJobRow, LabProgressAction } from "./types";

/** Lab job list with progress buttons; used by the lab portal and by the internal team on a lab's behalf. */
export function LabJobsTable({
  rows,
  action,
  showCustomer,
  showLab,
}: {
  rows: LabJobRow[];
  action: LabProgressAction;
  showCustomer?: boolean;
  showLab?: boolean;
}) {
  const t = useTranslations("lab");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [back, setBack] = useState<LabJobRow | null>(null);
  const [form, setForm] = useState({ returnCourier: "", returnAwb: "", returnNote: "" });

  const run = (jobId: string, to: "RECEIVED_AT_LAB" | "IN_PROGRESS" | "DISPATCHED_BACK", extra = {}) =>
    start(async () => {
      const res = await action({ jobId, to, ...extra });
      if (!res.ok) return void toast.error(res.error);
      toast.success(t("updated"));
      setBack(null);
      router.refresh();
    });

  const progressLabel = (r: LabJobRow) =>
    r.status === "DISPATCHED"
      ? t("awaitingLab")
      : r.status === "RETURNED" || r.status === "CERT_UPLOADED"
        ? t("returnedToPlant")
        : r.labProgress
          ? t(r.labProgress)
          : t("RECEIVED_AT_LAB");

  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="lab-jobs">
          <TableHeader>
            <TableRow>
              <TableHead>{t("instrument")}</TableHead>
              {showCustomer && <TableHead className="hidden md:table-cell">{t("customer")}</TableHead>}
              {showLab && <TableHead className="hidden md:table-cell">{t("lab")}</TableHead>}
              <TableHead className="hidden lg:table-cell">{t("challan")}</TableHead>
              <TableHead>{t("progress")}</TableHead>
              <TableHead>{t("certificate")}</TableHead>
              <TableHead>{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const steps = nextLabSteps(r.status, r.labProgress);
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-mono font-medium">{r.code}</div>
                    <div className="text-muted-foreground text-xs">
                      {r.description}
                      {r.serialNo && ` · S/N ${r.serialNo}`}
                    </div>
                  </TableCell>
                  {showCustomer && <TableCell className="hidden md:table-cell">{r.customer}</TableCell>}
                  {showLab && <TableCell className="hidden md:table-cell">{r.lab}</TableCell>}
                  <TableCell className="hidden lg:table-cell">
                    <div className="font-mono text-xs">{r.challan ?? "—"}</div>
                    <div className="text-muted-foreground text-xs">
                      {r.sentAt && `↑ ${r.sentAt}`} {r.expectedAt && `· ${t("expected")} ${r.expectedAt}`}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusPill
                      label={progressLabel(r)}
                      tone={
                        r.status === "DISPATCHED"
                          ? "neutral"
                          : r.labProgress === "DISPATCHED_BACK" || r.status === "RETURNED" || r.status === "CERT_UPLOADED"
                            ? "success"
                            : "info"
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {r.hasCert ? (
                      r.certHref ? (
                        <a
                          href={r.certHref}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm underline-offset-4 hover:underline"
                        >
                          ✓ {t("viewCert")}
                        </a>
                      ) : (
                        <span className="text-sm">✓ {t("hasCert")}</span>
                      )
                    ) : (
                      <span className="text-muted-foreground text-sm">{t("noCert")}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {steps.includes("RECEIVED_AT_LAB") && (
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() => run(r.id, "RECEIVED_AT_LAB")}
                          aria-label={`${t("markReceived")} ${r.code}`}
                        >
                          {t("markReceived")}
                        </Button>
                      )}
                      {steps.includes("IN_PROGRESS") && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => run(r.id, "IN_PROGRESS")}
                          aria-label={`${t("markInProgress")} ${r.code}`}
                        >
                          {t("markInProgress")}
                        </Button>
                      )}
                      {steps.includes("DISPATCHED_BACK") && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => (setBack(r), setForm({ returnCourier: "", returnAwb: "", returnNote: "" }))}
                          aria-label={`${t("markDispatched")} ${r.code}`}
                        >
                          {t("markDispatched")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <Dialog open={!!back} onOpenChange={(o) => !o && setBack(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dispatchTitle", { code: back?.code ?? "" })}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("courier")} htmlFor="ret-courier" optional>
              <Input
                id="ret-courier"
                className="h-11"
                value={form.returnCourier}
                onChange={(e) => setForm({ ...form, returnCourier: e.target.value })}
              />
            </Field>
            <Field label={t("awb")} htmlFor="ret-awb" optional>
              <Input
                id="ret-awb"
                className="h-11"
                value={form.returnAwb}
                onChange={(e) => setForm({ ...form, returnAwb: e.target.value })}
              />
            </Field>
            <Field label={t("note")} htmlFor="ret-note" optional className="sm:col-span-2">
              <Input
                id="ret-note"
                className="h-11"
                value={form.returnNote}
                onChange={(e) => setForm({ ...form, returnNote: e.target.value })}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button disabled={pending} onClick={() => back && run(back.id, "DISPATCHED_BACK", form)}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
