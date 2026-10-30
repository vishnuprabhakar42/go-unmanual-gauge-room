"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { organizationSchema } from "@/domain/schemas";
import { orgSettingsSchema } from "@/domain/settings";
import { updateOrganization } from "./actions";

const schema = z.object({
  organization: organizationSchema,
  settings: orgSettingsSchema.pick({ dueSoonDays: true, requireRequestApproval: true, challanCopies: true }).extend({
    dueSoonDays: z.coerce.number<string | number>().int().min(1).max(365),
    challanCopies: z.coerce.number<string | number>().int().min(1).max(3),
  }),
});

export function OrganizationForm({ defaults }: { defaults: z.input<typeof schema> }) {
  const t = useTranslations();
  const form = useForm({ resolver: zodResolver(schema), defaultValues: defaults });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    const res = await updateOrganization(values);
    if (res.ok) toast.success(t("common.saved"));
    else toast.error(res.error);
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t("setup.companyName")} htmlFor="name" error={e.organization?.name?.message} className="sm:col-span-2">
            <Input id="name" className="h-11" {...form.register("organization.name")} />
          </Field>
          <Field label={t("setup.gstin")} htmlFor="gstin" optional error={e.organization?.gstin?.message}>
            <Input id="gstin" className="h-11 uppercase" maxLength={15} {...form.register("organization.gstin")} />
          </Field>
          <Field label={t("setup.pan")} htmlFor="pan" optional error={e.organization?.pan?.message}>
            <Input id="pan" className="h-11 uppercase" maxLength={10} {...form.register("organization.pan")} />
          </Field>
          <Field label={t("setup.address")} htmlFor="address" optional className="sm:col-span-2">
            <Textarea id="address" rows={2} {...form.register("organization.address")} />
          </Field>
          <Field
            label={t("settings.dueSoonDays")}
            htmlFor="dueSoonDays"
            hint={t("settings.dueSoonHint")}
            error={e.settings?.dueSoonDays?.message}
          >
            <Input
              id="dueSoonDays"
              type="number"
              inputMode="numeric"
              className="h-11"
              {...form.register("settings.dueSoonDays")}
            />
          </Field>
          <Field label={t("settings.challanCopies")} htmlFor="challanCopies" error={e.settings?.challanCopies?.message}>
            <Input
              id="challanCopies"
              type="number"
              min={1}
              max={3}
              className="h-11"
              {...form.register("settings.challanCopies")}
            />
          </Field>
          <Controller
            control={form.control}
            name="settings.requireRequestApproval"
            render={({ field }) => (
              <div className="flex min-h-11 items-center gap-3 sm:col-span-2">
                <Checkbox id="requireApproval" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                <Label htmlFor="requireApproval">{t("settings.requireApproval")}</Label>
              </div>
            )}
          />
          <div className="sm:col-span-2">
            <Button type="submit" className="h-11" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
