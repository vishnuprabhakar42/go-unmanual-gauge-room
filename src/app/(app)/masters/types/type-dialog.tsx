"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, FREQUENCY_UNITS, instrumentTypeSchema, type InstrumentTypeInput } from "@/domain/instrument-schemas";
import { saveTypeAction } from "../actions";

export type TypeRow = {
  id: string;
  name: string;
  category: (typeof CATEGORIES)[number];
  parameter: string | null;
  unit: string | null;
  defaultFrequencyValue: number;
  defaultFrequencyUnit: (typeof FREQUENCY_UNITS)[number];
  defaultTolerance: string | null;
  nablRequired: boolean;
  hsnCode: string | null;
  defaultLeadTimeDays: number | null;
  standardCode: string | null;
  /** YYYY-MM-DD */
  standardDate: string;
  instruments: number;
  archived: boolean;
};

export function TypeDialog({ row }: { row?: TypeRow }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const defaults: InstrumentTypeInput = {
    name: row?.name ?? "",
    category: row?.category ?? "DIMENSIONAL",
    parameter: row?.parameter ?? "",
    unit: row?.unit ?? "",
    defaultFrequencyValue: row?.defaultFrequencyValue ?? 12,
    defaultFrequencyUnit: row?.defaultFrequencyUnit ?? "MONTHS",
    defaultTolerance: row?.defaultTolerance ?? "",
    nablRequired: row?.nablRequired ?? true,
    hsnCode: row?.hsnCode ?? "",
    defaultLeadTimeDays: row?.defaultLeadTimeDays == null ? "" : String(row.defaultLeadTimeDays),
    standardCode: row?.standardCode ?? "",
    standardDate: row?.standardDate ?? "",
  };
  const form = useForm({ resolver: zodResolver(instrumentTypeSchema), defaultValues: defaults });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit(async () => {
    const res = await saveTypeAction({ id: row?.id, data: form.getValues() });
    if (!res.ok) {
      for (const [f, m] of Object.entries(res.fieldErrors ?? {}))
        if (m?.[0]) form.setError(f as keyof InstrumentTypeInput, { message: m[0] });
      return void toast.error(res.error);
    }
    toast.success(t("common.saved"));
    setOpen(false);
    if (!row) form.reset(defaults);
  });

  const enumSelect = <K extends "category" | "defaultFrequencyUnit">(
    name: K,
    items: readonly string[],
    label: (v: string) => string,
  ) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <Select value={field.value as string} onValueChange={field.onChange}>
          <SelectTrigger id={name} className="h-11 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((v) => (
              <SelectItem key={v} value={v}>
                {label(v)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {row ? (
          <Button variant="ghost" size="sm">
            {t("masters.edit")}
          </Button>
        ) : (
          <Button className="h-10">
            <Plus className="size-4" />
            {t("masters.addType")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{row ? t("masters.editType") : t("masters.addType")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("masters.name")} htmlFor="name" error={e.name?.message} className="sm:col-span-2">
              <Input id="name" className="h-11" placeholder="Digital Vernier Caliper 0–150 mm" {...form.register("name")} />
            </Field>
            <Field label={t("masters.category")} htmlFor="category">
              {enumSelect("category", CATEGORIES, (v) => t(`category.${v as "OTHER"}`))}
            </Field>
            <Field label={t("masters.parameter")} htmlFor="parameter" optional>
              <Input id="parameter" className="h-11" placeholder="Length" {...form.register("parameter")} />
            </Field>
            <Field label={t("masters.unit")} htmlFor="unit" optional>
              <Input id="unit" className="h-11" placeholder="mm" {...form.register("unit")} />
            </Field>
            <Field label={t("masters.defaultFrequency")} htmlFor="defaultFrequencyValue" error={e.defaultFrequencyValue?.message}>
              <div className="flex gap-2">
                <Input
                  id="defaultFrequencyValue"
                  inputMode="numeric"
                  className="h-11 w-24"
                  {...form.register("defaultFrequencyValue")}
                />
                <div className="flex-1">
                  {enumSelect("defaultFrequencyUnit", FREQUENCY_UNITS, (v) => t(`frequencyUnit.${v as "DAYS"}`))}
                </div>
              </div>
            </Field>
            <Field label={t("masters.tolerance")} htmlFor="defaultTolerance" optional>
              <Input id="defaultTolerance" className="h-11" placeholder="±0.02 mm" {...form.register("defaultTolerance")} />
            </Field>
            <Field label={t("masters.hsn")} htmlFor="hsnCode" optional error={e.hsnCode?.message}>
              <Input id="hsnCode" inputMode="numeric" className="h-11" placeholder="9017" {...form.register("hsnCode")} />
            </Field>
            <Field
              label={t("masters.leadTime")}
              htmlFor="defaultLeadTimeDays"
              optional
              hint={t("masters.leadTimeHint")}
              error={e.defaultLeadTimeDays?.message}
            >
              <Input id="defaultLeadTimeDays" inputMode="numeric" className="h-11" {...form.register("defaultLeadTimeDays")} />
            </Field>
            <Field label={t("masters.standardCode")} htmlFor="standardCode" optional hint={t("masters.standardHint")}>
              <Input id="standardCode" className="h-11" placeholder="IS 3651 (Part 1)" {...form.register("standardCode")} />
            </Field>
            <Field label={t("masters.standardDate")} htmlFor="standardDate" optional error={e.standardDate?.message}>
              <Input id="standardDate" type="date" className="h-11" {...form.register("standardDate")} />
            </Field>
            <Controller
              control={form.control}
              name="nablRequired"
              render={({ field }) => (
                <div className="flex min-h-11 items-center gap-3">
                  <Checkbox id="nablRequired" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                  <Label htmlFor="nablRequired">{t("instruments.nablRequired")}</Label>
                </div>
              )}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
