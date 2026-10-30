"use client";

import { FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { matchCertificateFiles, type MatchCandidate } from "@/domain/certificate-match";
import { cn } from "@/lib/utils";
import type { UploadAction } from "./types";

type Candidate = MatchCandidate & { label: string };
type Pending = {
  file: File;
  jobId: string;
  how: "code" | "serial" | "ambiguous" | "unmatched" | "manual";
  state: "ready" | "done" | "error";
  error?: string;
};

const SKIP = "__skip__";

/**
 * Drag-drop many certificate PDFs → auto-match by instrument code / serial in the file name →
 * fix the rest manually → upload one file per request (keeps each request small).
 */
export function CertificateUploader({ candidates, action }: { candidates: Candidate[]; action: UploadAction }) {
  const t = useTranslations("lab");
  const router = useRouter();
  const [rows, setRows] = useState<Pending[]>([]);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const add = (files: FileList | File[]) => {
    const pdfs = [...files].filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    const matches = matchCertificateFiles(
      pdfs.map((f) => f.name),
      candidates,
    );
    setRows((rs) => [
      ...rs,
      ...pdfs.map((file, i): Pending => {
        const m = matches[i];
        return m.status === "matched"
          ? { file, jobId: m.jobId, how: m.by, state: "ready" }
          : { file, jobId: "", how: m.status, state: "ready" };
      }),
    ]);
  };

  const ready = rows.filter((r) => r.state !== "done" && r.jobId);

  const uploadAll = async () => {
    const queue = ready;
    setBusy({ done: 0, total: queue.length });
    let ok = 0;
    for (const r of queue) {
      const fd = new FormData();
      fd.set("jobId", r.jobId);
      fd.set("file", r.file);
      const res = await action(fd);
      setRows((rs) =>
        rs.map((x) => (x === r ? { ...x, state: res.ok ? "done" : "error", error: res.ok ? undefined : res.error } : x)),
      );
      if (res.ok) ok++;
      else toast.error(t("failed", { file: r.file.name, error: res.error }));
      setBusy((b) => (b ? { ...b, done: b.done + 1 } : b));
    }
    setBusy(null);
    if (ok) toast.success(t("uploaded", { count: ok }));
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("uploadTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          onDragOver={(e) => (e.preventDefault(), setDrag(true))}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            add(e.dataTransfer.files);
          }}
          className={cn(
            "flex min-h-36 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center",
            drag && "border-primary bg-muted/50",
          )}
        >
          <FileUp className="text-muted-foreground size-8" />
          <p className="text-muted-foreground max-w-md text-sm">{t("uploadHint")}</p>
          <Button type="button" variant="outline" onClick={() => input.current?.click()}>
            {t("choose")}
          </Button>
          <input
            ref={input}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="sr-only"
            data-testid="cert-files"
            onChange={(e) => {
              if (e.target.files) add(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-md border">
            <Table data-testid="cert-matches">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("file")}</TableHead>
                  <TableHead>{t("matchedTo")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={`${r.file.name}-${i}`} data-state={r.state}>
                    <TableCell className="max-w-56 truncate text-sm">
                      {r.state === "done" ? "✓ " : r.state === "error" ? "✕ " : ""}
                      {r.file.name}
                      {r.error && <div className="text-destructive text-xs">{r.error}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={r.jobId || SKIP}
                          disabled={r.state === "done" || !!busy}
                          onValueChange={(v) =>
                            setRows((rs) => rs.map((x, j) => (j === i ? { ...x, jobId: v === SKIP ? "" : v, how: "manual" } : x)))
                          }
                        >
                          <SelectTrigger className="h-9 w-64" aria-label={`${t("matchedTo")} ${r.file.name}`}>
                            <SelectValue placeholder={t("chooseJob")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SKIP}>{t("skip")}</SelectItem>
                            {candidates.map((c) => (
                              <SelectItem key={c.jobId} value={c.jobId}>
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span
                          className={cn(
                            "text-xs",
                            r.how === "ambiguous" || r.how === "unmatched"
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-muted-foreground",
                          )}
                          data-match={r.how}
                        >
                          {r.how === "code"
                            ? t("auto")
                            : r.how === "serial"
                              ? `${t("auto")} · ${t("bySerial")}`
                              : r.how === "ambiguous"
                                ? t("ambiguous")
                                : r.how === "unmatched"
                                  ? t("unmatched")
                                  : ""}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {rows.length > 0 && (
          <Button className="h-11" disabled={!!busy || ready.length === 0} onClick={uploadAll} data-testid="upload-certs">
            {busy ? t("uploading", busy) : t("uploadAll", { count: ready.length })}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
