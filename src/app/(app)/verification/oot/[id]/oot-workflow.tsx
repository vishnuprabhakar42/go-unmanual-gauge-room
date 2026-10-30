"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { OotDisposition } from "@/domain/oot";
import { closeOotAction, decideDispositionAction, saveAssessmentAction } from "../../actions";

type Props = {
  id: string;
  status: "OPEN" | "ASSESSING" | "DISPOSITIONED" | "CLOSED";
  initial: { lastGoodCalibrationAt: string; impactNotes: string; affectedProducts: string };
  dispositions: { value: OotDisposition; label: string }[];
  decided: { label: string; notes: string; by: string } | null;
  closed: { on: string; capa: string | null } | null;
  can: { assess: boolean; decide: boolean };
};

export function OotWorkflow({ id, status, initial, dispositions, decided, closed, can }: Props) {
  const t = useTranslations("oot");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [a, setA] = useState(initial);
  const [disposition, setDisposition] = useState<OotDisposition | "">("");
  const [notes, setNotes] = useState("");
  const [capa, setCapa] = useState("");
  const editable = can.assess && (status === "OPEN" || status === "ASSESSING");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error);
      toast.success(ok);
      router.refresh();
    });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("assessment")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="lastGood">{t("lastGood")}</Label>
            <Input
              id="lastGood"
              type="date"
              value={a.lastGoodCalibrationAt}
              disabled={!editable}
              onChange={(e) => setA({ ...a, lastGoodCalibrationAt: e.target.value })}
              className="max-w-48"
            />
            <p className="text-muted-foreground text-xs">{t("lastGoodHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="impactNotes">{t("impactNotes")}</Label>
            <Textarea
              id="impactNotes"
              rows={4}
              value={a.impactNotes}
              disabled={!editable}
              onChange={(e) => setA({ ...a, impactNotes: e.target.value })}
            />
            <p className="text-muted-foreground text-xs">{t("impactHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="affectedProducts">{t("affectedProducts")}</Label>
            <Textarea
              id="affectedProducts"
              rows={3}
              value={a.affectedProducts}
              disabled={!editable}
              onChange={(e) => setA({ ...a, affectedProducts: e.target.value })}
            />
            <p className="text-muted-foreground text-xs">{t("affectedHint")}</p>
          </div>
          {editable && (
            <Button type="button" disabled={pending} onClick={() => run(() => saveAssessmentAction({ id, ...a }), t("saved"))}>
              {t("saveAssessment")}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("decision")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {decided ? (
            <div className="space-y-1 text-sm" data-testid="oot-decision">
              <p className="font-medium">{decided.label}</p>
              <p>{decided.notes}</p>
              <p className="text-muted-foreground">{decided.by}</p>
            </div>
          ) : status === "OPEN" ? (
            <p className="text-muted-foreground text-sm">{t("needsAssessment")}</p>
          ) : !can.decide ? (
            <p className="text-muted-foreground text-sm">{t("onlyQuality")}</p>
          ) : (
            <>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">{t("disposition")}</legend>
                {dispositions.map((d) => (
                  <div key={d.value} className="flex min-h-9 items-center gap-3">
                    <input
                      type="radio"
                      id={`d-${d.value}`}
                      name="disposition"
                      value={d.value}
                      checked={disposition === d.value}
                      onChange={() => setDisposition(d.value)}
                      className="size-4"
                    />
                    <Label htmlFor={`d-${d.value}`}>{d.label}</Label>
                  </div>
                ))}
              </fieldset>
              <div className="space-y-1.5">
                <Label htmlFor="notes">{t("notes")}</Label>
                <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <Button
                type="button"
                disabled={pending || !disposition || !notes.trim()}
                onClick={() => disposition && run(() => decideDispositionAction({ id, disposition, notes }), t("decided"))}
              >
                {t("decide")}
              </Button>
            </>
          )}

          {closed ? (
            <p className="text-muted-foreground border-t pt-3 text-sm">
              {closed.on}
              {closed.capa && ` · ${t("capa", { ref: closed.capa })}`}
            </p>
          ) : (
            status === "DISPOSITIONED" &&
            can.decide && (
              <div className="space-y-2 border-t pt-3">
                <Label htmlFor="capa">{t("capaRef")}</Label>
                <div className="flex gap-2">
                  <Input id="capa" value={capa} onChange={(e) => setCapa(e.target.value)} className="max-w-56" />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(() => closeOotAction({ id, capaRef: capa }), t("closed"))}
                  >
                    {t("close")}
                  </Button>
                </div>
              </div>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
