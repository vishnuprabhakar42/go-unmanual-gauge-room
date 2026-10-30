"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LabelsDialog } from "@/components/instruments/labels-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** After a PASS: offer a fresh calibration label (new due date) before the instrument goes back. */
export function ReprintPrompt({ instrumentId, code }: { instrumentId: string; code: string }) {
  const t = useTranslations("verification");
  const router = useRouter();
  const [step, setStep] = useState<"ask" | "labels" | "done">("ask");
  const done = () => {
    setStep("done");
    router.replace("/verification");
  };
  return (
    <>
      <Dialog open={step === "ask"} onOpenChange={(o) => !o && done()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("reprintTitle")}</DialogTitle>
            <DialogDescription>{t("reprintHint", { code })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={done}>
              {t("later")}
            </Button>
            <Button type="button" onClick={() => setStep("labels")}>
              {t("reprint")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <LabelsDialog open={step === "labels"} onOpenChange={(o) => !o && done()} ids={[instrumentId]} />
    </>
  );
}
