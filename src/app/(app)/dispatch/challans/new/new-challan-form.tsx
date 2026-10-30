"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { totalValue } from "@/domain/challan";
import { formatINR } from "@/domain/india/format";
import { createChallanAction } from "../../actions";

type Item = {
  poItemId: string;
  code: string;
  description: string;
  hsnCode: string;
  value: number | null;
  blocked: string | null;
};
type Line = { include: boolean; value: string; hsnCode: string; description: string };

export function NewChallanForm({ poId, items }: { poId: string; items: Item[] }) {
  const t = useTranslations("dispatch");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Record<string, Line>>(() =>
    Object.fromEntries(
      items.map((i) => [
        i.poItemId,
        { include: !i.blocked, value: i.value != null ? String(i.value) : "", hsnCode: i.hsnCode, description: i.description },
      ]),
    ),
  );
  const set = (id: string, patch: Partial<Line>) => setLines((ls) => ({ ...ls, [id]: { ...ls[id], ...patch } }));
  const chosen = items.filter((i) => !i.blocked && lines[i.poItemId].include);
  const total = totalValue(chosen.map((i) => ({ value: Number(lines[i.poItemId].value) || 0 })));

  const save = () =>
    start(async () => {
      const res = await createChallanAction({
        poId,
        notes,
        lines: chosen.map((i) => ({
          poItemId: i.poItemId,
          value: lines[i.poItemId].value,
          hsnCode: lines[i.poItemId].hsnCode,
          description: lines[i.poItemId].description,
        })),
      });
      if (!res.ok) return void toast.error(res.error);
      router.push(`/dispatch/challans/${res.data.id}`);
    });

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="challan-lines">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">{t("include")}</TableHead>
              <TableHead>{t("code")}</TableHead>
              <TableHead>{t("description")}</TableHead>
              <TableHead>{t("hsn")}</TableHead>
              <TableHead>{t("value")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((i) => {
              const l = lines[i.poItemId];
              return (
                <TableRow key={i.poItemId} className={i.blocked ? "opacity-60" : undefined}>
                  <TableCell>
                    <Checkbox
                      aria-label={`${t("include")} ${i.code}`}
                      checked={l.include && !i.blocked}
                      disabled={!!i.blocked}
                      onCheckedChange={(v) => set(i.poItemId, { include: v === true })}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {i.code}
                    {i.blocked && <div className="text-muted-foreground font-sans text-xs">{i.blocked}</div>}
                  </TableCell>
                  <TableCell>
                    <Input
                      aria-label={`${t("description")} ${i.code}`}
                      className="h-9 min-w-64"
                      value={l.description}
                      disabled={!!i.blocked}
                      onChange={(e) => set(i.poItemId, { description: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      aria-label={`${t("hsn")} ${i.code}`}
                      className="h-9 w-24"
                      inputMode="numeric"
                      value={l.hsnCode}
                      disabled={!!i.blocked}
                      onChange={(e) => set(i.poItemId, { hsnCode: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      aria-label={`${t("value")} ${i.code}`}
                      className="h-9 w-28 tabular-nums"
                      inputMode="decimal"
                      value={l.value}
                      disabled={!!i.blocked}
                      onChange={(e) => set(i.poItemId, { value: e.target.value })}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="flex justify-end text-sm">
        <span className="text-muted-foreground mr-2">{t("totalValue")}:</span>
        <span className="font-semibold tabular-nums">{formatINR(total)}</span>
      </div>
      <Field label={t("notes")} htmlFor="challan-notes" optional>
        <Textarea id="challan-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button className="h-11" onClick={save} disabled={pending || chosen.length === 0} data-testid="save-challan">
        {t("saveDraft")}
      </Button>
    </div>
  );
}
