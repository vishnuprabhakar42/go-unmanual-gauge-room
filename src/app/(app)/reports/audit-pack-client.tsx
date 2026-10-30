"use client";

import { Download, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { requestAuditPackAction, retryAuditPackAction } from "./actions";

export function AuditPackForm({
  plants,
  defaultPlant,
  defaultFrom,
  defaultTo,
}: {
  plants: { id: string; label: string }[];
  defaultPlant: string;
  defaultFrom: string;
  defaultTo: string;
}) {
  const t = useTranslations("reports");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [plantId, setPlantId] = useState(defaultPlant);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await requestAuditPackAction({ plantId, from, to });
      if (!res.ok) return void toast.error(res.error);
      toast.success(t("queued"));
      router.refresh();
    });
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pack-plant">{t("plant")}</Label>
          <Select value={plantId} onValueChange={setPlantId}>
            <SelectTrigger id="pack-plant" className="h-11 w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {plants.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pack-from">{t("from")}</Label>
          <Input id="pack-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11 w-44" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pack-to">{t("to")}</Label>
          <Input id="pack-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-11 w-44" />
        </div>
        <Button type="submit" className="h-11" disabled={pending || !plantId}>
          {t("generate")}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">{t("packHint")}</p>
    </form>
  );
}

/** Re-renders the server page every few seconds while a pack is queued or generating. */
export function RefreshWhileRunning({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [active, router]);
  return null;
}

export function PackActions({
  id,
  status,
  fileId,
  canRetry,
}: {
  id: string;
  status: string;
  fileId: string | null;
  canRetry: boolean;
}) {
  const t = useTranslations("reports");
  const router = useRouter();
  const [pending, start] = useTransition();
  if (status === "READY" && fileId)
    return (
      <Button asChild size="sm" variant="outline">
        <a href={`/api/attachments/${fileId}`} target="_blank" rel="noreferrer" data-testid="pack-download">
          <Download aria-hidden="true" />
          {t("download")}
        </a>
      </Button>
    );
  if (status === "FAILED" && canRetry)
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await retryAuditPackAction({ id });
            if (!res.ok) return void toast.error(res.error);
            toast.success(t("retried"));
            router.refresh();
          })
        }
      >
        <RotateCw aria-hidden="true" />
        {t("retry")}
      </Button>
    );
  return null;
}
