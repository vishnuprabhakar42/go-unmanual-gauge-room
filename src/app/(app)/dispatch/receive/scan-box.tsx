"use client";

import { ScanLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { receiveByScanAction } from "../actions";

/** Keyboard-wedge friendly: scanners type the QR URL/code and press Enter. Field refocuses for the next scan. */
export function ScanBox() {
  const t = useTranslations("dispatch");
  const router = useRouter();
  const [value, setValue] = useState("");
  const [log, setLog] = useState<{ ok: boolean; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const queue = useRef<string[]>([]);
  const running = useRef(false);

  /** Scanners fire codes faster than the server answers: clear the field at once and process scans in order. */
  const drain = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    while (queue.current.length) {
      const scanned = queue.current.shift()!;
      const res = await receiveByScanAction({ scanned });
      const entry = res.ok
        ? { ok: true, text: t("scanReceived", { code: res.data.code, challan: res.data.challanNumber ?? "" }) }
        : { ok: false, text: res.error };
      if (res.ok) toast.success(entry.text);
      else toast.error(entry.text);
      setLog((l) => [entry, ...l].slice(0, 8));
    }
    running.current = false;
    setBusy(false);
    router.refresh();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const scanned = value.trim();
    if (!scanned) return;
    queue.current.push(scanned);
    setValue("");
    ref.current?.focus();
    void drain();
  };

  return (
    <Card>
      <CardContent>
        <form onSubmit={submit} className="space-y-2">
          <Label htmlFor="scan">{t("scanLabel")}</Label>
          <div className="flex gap-2">
            <Input
              id="scan"
              ref={ref}
              autoFocus
              autoComplete="off"
              className="h-12 text-base"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              data-testid="scan-input"
            />
            <Button type="submit" className="h-12" aria-busy={busy}>
              <ScanLine className="size-5" />
              {t("receive")}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">{t("scanHint")}</p>
        </form>
        {log.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm" aria-live="polite" data-testid="scan-log">
            {log.map((l, i) => (
              <li key={i} className={l.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}>
                {l.ok ? "✓" : "✕"} {l.text}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
