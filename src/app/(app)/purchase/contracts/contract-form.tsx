"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { rateContractSchema } from "@/domain/vendor-schemas";
import { createContractAction, updateContractAction } from "../actions";

const ALL = "__all__";
type Values = z.input<typeof rateContractSchema>;

export function ContractForm({
  defaults,
  vendors,
  plants,
  contractId,
  readOnly,
}: {
  defaults: Values;
  vendors: { id: string; name: string }[];
  plants: { id: string; label: string }[];
  contractId?: string;
  readOnly?: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const form = useForm({ resolver: zodResolver(rateContractSchema), defaultValues: defaults });
  const e = form.formState.errors;
  const onSubmit = form.handleSubmit(async () => {
    const values = form.getValues();
    const res = contractId ? await updateContractAction({ id: contractId, data: values }) : await createContractAction(values);
    if (!res.ok) {
      for (const [f, m] of Object.entries(res.fieldErrors ?? {})) if (m?.[0]) form.setError(f as keyof Values, { message: m[0] });
      return void toast.error(res.error);
    }
    toast.success(t("common.saved"));
    if (!contractId && res.data) router.push(`/purchase/contracts/${(res.data as { id: string }).id}`);
  });
  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardContent>
          <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t("contracts.vendor")} htmlFor="vendorId" error={e.vendorId?.message}>
              <Controller
                control={form.control}
                name="vendorId"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange} disabled={!!contractId}>
                    <SelectTrigger id="vendorId" className="h-11 w-full">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label={t("contracts.number")} htmlFor="number" error={e.number?.message}>
              <Input id="number" className="h-11 font-mono" {...form.register("number")} />
            </Field>
            <Field label={t("contracts.plant")} htmlFor="plantId">
              <Controller
                control={form.control}
                name="plantId"
                render={({ field }) => (
                  <Select value={field.value || ALL} onValueChange={(v) => field.onChange(v === ALL ? "" : v)}>
                    <SelectTrigger id="plantId" className="h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>{t("contracts.allPlants")}</SelectItem>
                      {plants.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label={t("contracts.validFrom")} htmlFor="validFrom" error={e.validFrom?.message}>
              <Input id="validFrom" type="date" className="h-11" {...form.register("validFrom")} />
            </Field>
            <Field label={t("contracts.validTo")} htmlFor="validTo" error={e.validTo?.message}>
              <Input id="validTo" type="date" className="h-11" {...form.register("validTo")} />
            </Field>
            <Field label={t("contracts.notes")} htmlFor="notes" optional className="sm:col-span-2 lg:col-span-3">
              <Textarea id="notes" rows={2} {...form.register("notes")} />
            </Field>
            {!readOnly && (
              <div>
                <Button type="submit" className="h-11" disabled={form.formState.isSubmitting}>
                  {t("common.save")}
                </Button>
              </div>
            )}
          </fieldset>
        </CardContent>
      </Card>
    </form>
  );
}
