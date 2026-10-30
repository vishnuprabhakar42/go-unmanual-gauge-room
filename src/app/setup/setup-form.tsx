"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Field } from "@/components/forms/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { setupSchema } from "@/domain/schemas";
import { completeSetup } from "./actions";

export function SetupForm() {
  const t = useTranslations("setup");
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      organization: { name: "", gstin: "", pan: "", address: "" },
      plant: { name: "", code: "", gstin: "", address: "" },
    },
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const res = await completeSetup(values);
    if (res && !res.ok) setError(res.error);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="w-full max-w-2xl space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("company")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t("companyName")} htmlFor="org-name" error={e.organization?.name?.message} className="sm:col-span-2">
            <Input id="org-name" className="h-11" {...form.register("organization.name")} />
          </Field>
          <Field label={t("gstin")} htmlFor="org-gstin" optional error={e.organization?.gstin?.message}>
            <Input id="org-gstin" className="h-11 uppercase" maxLength={15} {...form.register("organization.gstin")} />
          </Field>
          <Field label={t("pan")} htmlFor="org-pan" optional error={e.organization?.pan?.message}>
            <Input id="org-pan" className="h-11 uppercase" maxLength={10} {...form.register("organization.pan")} />
          </Field>
          <Field label={t("address")} htmlFor="org-address" optional className="sm:col-span-2">
            <Textarea id="org-address" rows={2} {...form.register("organization.address")} />
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("firstPlant")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t("plantName")} htmlFor="plant-name" error={e.plant?.name?.message}>
            <Input id="plant-name" className="h-11" {...form.register("plant.name")} />
          </Field>
          <Field label={t("plantCode")} htmlFor="plant-code" error={e.plant?.code?.message} hint={t("plantCodeHint")}>
            <Input id="plant-code" className="h-11 uppercase" maxLength={4} {...form.register("plant.code")} />
          </Field>
          <Field label={t("plantGstin")} htmlFor="plant-gstin" optional error={e.plant?.gstin?.message}>
            <Input id="plant-gstin" className="h-11 uppercase" maxLength={15} {...form.register("plant.gstin")} />
          </Field>
          <Field label={t("plantAddress")} htmlFor="plant-address" optional className="sm:col-span-2">
            <Textarea id="plant-address" rows={2} {...form.register("plant.address")} />
          </Field>
        </CardContent>
      </Card>
      <Button type="submit" className="h-11 w-full" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
