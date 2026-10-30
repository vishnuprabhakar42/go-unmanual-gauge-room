"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { computeNextDue } from "@/domain/due";
import { formatDate } from "@/domain/india/format";
import {
  ADJUSTABILITY,
  CAL_SOURCES,
  CRITICALITIES,
  FREQUENCY_UNITS,
  instrumentSchema,
  type InstrumentInput,
} from "@/domain/instrument-schemas";
import { createInstrumentAction, updateInstrumentAction } from "./actions";
import type { FormOptions } from "./form-data";

const NONE = "__none__";

export function InstrumentForm({
  options,
  defaults,
  instrumentId,
  canSetPlanning = false,
}: {
  options: FormOptions;
  defaults: InstrumentInput;
  instrumentId?: string;
  /** Admins (org.manage) may override the planning lead time per instrument */
  canSetPlanning?: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const form = useForm({ resolver: zodResolver(instrumentSchema), defaultValues: defaults });
  const e = form.formState.errors;
  const [plantId, lastCal, freqValue, freqUnit, typeId, nextDueInput, planLead] = useWatch({
    control: form.control,
    name: ["plantId", "lastCalibratedAt", "frequencyValue", "frequencyUnit", "typeId", "nextDueAt", "planLeadDays"],
  });
  const type = options.types.find((x) => x.id === typeId);
  const defaultLead = type?.defaultLeadTimeDays ?? options.orgLeadDays;

  const computedDue = (() => {
    const m = typeof lastCal === "string" ? lastCal.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
    const n = Number(freqValue);
    if (!m || !Number.isInteger(n) || n < 1) return null;
    return computeNextDue(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) - 330 * 60_000), n, freqUnit as "DAYS" | "MONTHS");
  })();

  const dueForPlanning =
    computedDue ??
    (typeof nextDueInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(nextDueInput)
      ? new Date(`${nextDueInput}T00:00:00+05:30`)
      : null);
  const leadDays = planLead !== "" && planLead != null && Number.isInteger(Number(planLead)) ? Number(planLead) : defaultLead;
  const planningPreview = dueForPlanning ? new Date(dueForPlanning.getTime() - leadDays * 86_400_000) : null;

  // Validate client-side, but send the raw input: the server action re-parses it with the same schema.
  const onSubmit = form.handleSubmit(async () => {
    const values = form.getValues();
    const res = instrumentId
      ? await updateInstrumentAction({ id: instrumentId, data: values })
      : await createInstrumentAction(values);
    if (!res.ok) {
      for (const [field, msgs] of Object.entries(res.fieldErrors ?? {})) {
        if (msgs?.[0]) form.setError(field as keyof InstrumentInput, { message: msgs[0] });
      }
      toast.error(res.error);
      return;
    }
    toast.success(instrumentId ? t("instruments.updated") : t("instruments.created"));
    router.push(`/instruments/${res.data.id}`);
  });

  const select = (
    name: keyof InstrumentInput,
    items: { value: string; label: string }[],
    opts: { optional?: boolean; id: string; onPick?: (v: string) => void },
  ) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <Select
          value={field.value ? String(field.value) : opts.optional ? NONE : undefined}
          onValueChange={(v) => {
            const val = v === NONE ? "" : v;
            field.onChange(val);
            opts.onPick?.(val);
          }}
        >
          <SelectTrigger id={opts.id} className="h-11 w-full">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {opts.optional && <SelectItem value={NONE}>—</SelectItem>}
            {items.map((i) => (
              <SelectItem key={i.value} value={i.value}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );

  const onTypePicked = (typeId: string) => {
    const type = options.types.find((x) => x.id === typeId);
    if (!type || instrumentId) return; // only prefill for new instruments
    form.setValue("frequencyValue", type.defaultFrequencyValue);
    form.setValue("frequencyUnit", type.defaultFrequencyUnit);
    form.setValue("nablRequired", type.nablRequired);
    if (type.unit && !form.getValues("unit")) form.setValue("unit", type.unit);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("instruments.sectionIdentity")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("instruments.code")} htmlFor="code" error={e.code?.message}>
            <Input id="code" className="h-11 font-mono" {...form.register("code")} />
          </Field>
          <Field label={t("instruments.type")} htmlFor="typeId" error={e.typeId?.message}>
            {select(
              "typeId",
              options.types.map((x) => ({ value: x.id, label: x.name })),
              { id: "typeId", onPick: onTypePicked },
            )}
          </Field>
          <Field label={t("instruments.description")} htmlFor="description" optional>
            <Input id="description" className="h-11" {...form.register("description")} />
          </Field>
          <Field label={t("instruments.make")} htmlFor="make" optional>
            <Input id="make" className="h-11" {...form.register("make")} />
          </Field>
          <Field label={t("instruments.model")} htmlFor="model" optional>
            <Input id="model" className="h-11" {...form.register("model")} />
          </Field>
          <Field label={t("instruments.serialNo")} htmlFor="serialNo" optional>
            <Input id="serialNo" className="h-11" {...form.register("serialNo")} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("instruments.sectionSpec")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Field label={t("instruments.rangeMin")} htmlFor="rangeMin" optional error={e.rangeMin?.message}>
            <Input id="rangeMin" inputMode="decimal" className="h-11" {...form.register("rangeMin")} />
          </Field>
          <Field label={t("instruments.rangeMax")} htmlFor="rangeMax" optional error={e.rangeMax?.message}>
            <Input id="rangeMax" inputMode="decimal" className="h-11" {...form.register("rangeMax")} />
          </Field>
          <Field label={t("instruments.unit")} htmlFor="unit" optional>
            <Input id="unit" className="h-11" {...form.register("unit")} />
          </Field>
          <Field label={t("instruments.leastCount")} htmlFor="leastCount" optional error={e.leastCount?.message}>
            <Input id="leastCount" inputMode="decimal" className="h-11" {...form.register("leastCount")} />
          </Field>
          <Field label={t("instruments.tolerancePlus")} htmlFor="tolerancePlus" optional error={e.tolerancePlus?.message}>
            <Input id="tolerancePlus" inputMode="decimal" className="h-11" {...form.register("tolerancePlus")} />
          </Field>
          <Field label={t("instruments.toleranceMinus")} htmlFor="toleranceMinus" optional error={e.toleranceMinus?.message}>
            <Input id="toleranceMinus" inputMode="decimal" className="h-11" {...form.register("toleranceMinus")} />
          </Field>
          <Field label={t("instruments.acceptanceCriteria")} htmlFor="acceptanceCriteria" optional className="col-span-2">
            <Input id="acceptanceCriteria" className="h-11" {...form.register("acceptanceCriteria")} />
          </Field>
          <Field label={t("instruments.adjustable")} htmlFor="adjustable" optional className="col-span-2">
            {select(
              "adjustable",
              ADJUSTABILITY.map((a) => ({ value: a, label: t(`adjustability.${a}`) })),
              { id: "adjustable", optional: true },
            )}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("instruments.sectionStandard")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label={t("instruments.standardCode")}
            htmlFor="standardCode"
            optional
            hint={
              type?.standardCode
                ? t("instruments.standardInherited", { code: type.standardCode, date: type.standardDate ?? "—" })
                : t("instruments.standardHint")
            }
            className="sm:col-span-2"
          >
            <Input
              id="standardCode"
              className="h-11"
              placeholder={type?.standardCode ?? "IS 3651 (Part 1)"}
              {...form.register("standardCode")}
            />
          </Field>
          <Field label={t("instruments.standardDate")} htmlFor="standardDate" optional error={e.standardDate?.message}>
            <Input id="standardDate" type="date" className="h-11" {...form.register("standardDate")} />
          </Field>
          <Field
            label={t("instruments.planLeadDays")}
            htmlFor="planLeadDays"
            optional
            error={e.planLeadDays?.message}
            hint={
              canSetPlanning
                ? t("instruments.planLeadHint", { days: defaultLead })
                : t("instruments.planLeadAdminOnly", { days: defaultLead })
            }
          >
            <Input
              id="planLeadDays"
              inputMode="numeric"
              className="h-11"
              placeholder={String(defaultLead)}
              disabled={!canSetPlanning}
              {...form.register("planLeadDays")}
            />
          </Field>
          {planningPreview && (
            <p className="text-muted-foreground text-sm sm:col-span-2 lg:col-span-4" data-testid="planning-preview">
              {t("instruments.planningPreview", { date: formatDate(planningPreview), days: leadDays })}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("instruments.sectionPlace")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("instruments.plant")} htmlFor="plantId" error={e.plantId?.message}>
            {select(
              "plantId",
              options.plants.map((p) => ({ value: p.id, label: p.label })),
              {
                id: "plantId",
                onPick: () => {
                  form.setValue("departmentId", "");
                  form.setValue("locationId", "");
                },
              },
            )}
          </Field>
          <Field label={t("instruments.department")} htmlFor="departmentId" optional error={e.departmentId?.message}>
            {select(
              "departmentId",
              options.departments.filter((d) => d.plantId === plantId).map((d) => ({ value: d.id, label: d.name })),
              { id: "departmentId", optional: true },
            )}
          </Field>
          <Field label={t("instruments.location")} htmlFor="locationId" optional error={e.locationId?.message}>
            {select(
              "locationId",
              options.locations.filter((l) => l.plantId === plantId).map((l) => ({ value: l.id, label: l.name })),
              { id: "locationId", optional: true },
            )}
          </Field>
          <Field label={t("instruments.custodian")} htmlFor="custodianName" optional>
            <Input id="custodianName" className="h-11" {...form.register("custodianName")} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("instruments.sectionCalibration")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("instruments.frequencyValue")} htmlFor="frequencyValue" error={e.frequencyValue?.message}>
            <div className="flex gap-2">
              <Input id="frequencyValue" inputMode="numeric" className="h-11 w-24" {...form.register("frequencyValue")} />
              <div className="flex-1">
                {select(
                  "frequencyUnit",
                  FREQUENCY_UNITS.map((u) => ({ value: u, label: t(`frequencyUnit.${u}`) })),
                  { id: "frequencyUnit" },
                )}
              </div>
            </div>
          </Field>
          <Field
            label={t("instruments.lastCalibratedAt")}
            htmlFor="lastCalibratedAt"
            optional
            error={e.lastCalibratedAt?.message}
          >
            <Input id="lastCalibratedAt" type="date" className="h-11" {...form.register("lastCalibratedAt")} />
          </Field>
          <Field
            label={t("instruments.nextDueAt")}
            htmlFor="nextDueAt"
            optional={!computedDue}
            hint={computedDue ? undefined : t("instruments.nextDueHint")}
            error={e.nextDueAt?.message}
          >
            {computedDue ? (
              <div className="bg-muted flex h-11 items-center rounded-md px-3 text-sm font-medium" data-testid="computed-due">
                {formatDate(computedDue)}
              </div>
            ) : (
              <Input id="nextDueAt" type="date" className="h-11" {...form.register("nextDueAt")} />
            )}
          </Field>
          <Field label={t("instruments.criticality")} htmlFor="criticality">
            {select(
              "criticality",
              CRITICALITIES.map((c) => ({ value: c, label: t(`criticality.${c}`) })),
              { id: "criticality" },
            )}
          </Field>
          <Field label={t("instruments.source")} htmlFor="calibrationSource">
            {select(
              "calibrationSource",
              CAL_SOURCES.map((c) => ({ value: c, label: t(`source.${c}`) })),
              { id: "calibrationSource" },
            )}
          </Field>
          <Field
            label={t("instruments.purchaseValue")}
            htmlFor="purchaseValue"
            optional
            hint={t("instruments.purchaseValueHint")}
            error={e.purchaseValue?.message}
          >
            <Input id="purchaseValue" inputMode="decimal" className="h-11" {...form.register("purchaseValue")} />
          </Field>
          <Controller
            control={form.control}
            name="nablRequired"
            render={({ field }) => (
              <div className="flex min-h-11 items-center gap-3 sm:col-span-2">
                <Checkbox id="nablRequired" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                <Label htmlFor="nablRequired">{t("instruments.nablRequired")}</Label>
              </div>
            )}
          />
          <Field label={t("instruments.notes")} htmlFor="notes" optional className="sm:col-span-2 lg:col-span-4">
            <Textarea id="notes" rows={2} {...form.register("notes")} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" className="h-11" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? t("common.saving") : t("common.save")}
        </Button>
        <Button type="button" variant="outline" className="h-11" onClick={() => router.back()}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
