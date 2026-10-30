"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Field } from "@/components/forms/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GST_STATES } from "@/domain/india/states";
import { ACCREDITATION_TYPES, vendorSchema, type VendorInput } from "@/domain/vendor-schemas";
import { createVendorAction, updateVendorAction } from "./actions";

const NONE = "__none__";

export function VendorForm({ defaults, vendorId, shared }: { defaults: VendorInput; vendorId?: string; shared?: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const form = useForm({ resolver: zodResolver(vendorSchema), defaultValues: defaults });
  const contacts = useFieldArray({ control: form.control, name: "contacts" });
  const accreditation = useWatch({ control: form.control, name: "accreditationType" });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit(async () => {
    const values = form.getValues();
    const res = vendorId ? await updateVendorAction({ id: vendorId, data: values }) : await createVendorAction(values);
    if (!res.ok) {
      for (const [f, m] of Object.entries(res.fieldErrors ?? {}))
        if (m?.[0]) form.setError(f as keyof VendorInput, { message: m[0] });
      return void toast.error(res.error);
    }
    toast.success(t("common.saved"));
    router.push(`/vendors/${res.data.id}`);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {shared && (
        <Alert>
          <AlertDescription>{t("vendors.sharedNote")}</AlertDescription>
        </Alert>
      )}
      <fieldset disabled={shared} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("vendors.name")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label={t("vendors.name")} htmlFor="name" error={e.name?.message} className="sm:col-span-2">
              <Input id="name" className="h-11" {...form.register("name")} />
            </Field>
            <Field label={t("vendors.gstin")} htmlFor="gstin" optional error={e.gstin?.message}>
              <Input id="gstin" maxLength={15} className="h-11 uppercase" {...form.register("gstin")} />
            </Field>
            <Field label={t("vendors.pan")} htmlFor="pan" optional error={e.pan?.message}>
              <Input id="pan" maxLength={10} className="h-11 uppercase" {...form.register("pan")} />
            </Field>
            <Field label={t("vendors.address")} htmlFor="address" optional className="sm:col-span-2">
              <Textarea id="address" rows={2} {...form.register("address")} />
            </Field>
            <Field label={t("vendors.state")} htmlFor="stateCode" optional error={e.stateCode?.message}>
              <Controller
                control={form.control}
                name="stateCode"
                render={({ field }) => (
                  <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? "" : v)}>
                    <SelectTrigger id="stateCode" className="h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>—</SelectItem>
                      {Object.entries(GST_STATES).map(([code, name]) => (
                        <SelectItem key={code} value={code}>
                          {code} · {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Controller
              control={form.control}
              name="onsiteCapable"
              render={({ field }) => (
                <div className="flex min-h-11 items-center gap-3 self-end">
                  <Checkbox id="onsite" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                  <Label htmlFor="onsite">{t("vendors.onsite")}</Label>
                </div>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("vendors.accreditation")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field label={t("vendors.accreditation")} htmlFor="accreditationType">
              <Controller
                control={form.control}
                name="accreditationType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="accreditationType" className="h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCREDITATION_TYPES.map((a) => (
                        <SelectItem key={a} value={a}>
                          {t(`accreditation.${a}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field
              label={t("vendors.nablCertNo")}
              htmlFor="nablCertNo"
              optional={accreditation !== "NABL"}
              error={e.nablCertNo?.message}
            >
              <Input id="nablCertNo" className="h-11 font-mono" placeholder="CC-1234" {...form.register("nablCertNo")} />
            </Field>
            <Field
              label={t("vendors.nablValidUntil")}
              htmlFor="nablValidUntil"
              optional={accreditation !== "NABL"}
              error={e.nablValidUntil?.message}
            >
              <Input id="nablValidUntil" type="date" className="h-11" {...form.register("nablValidUntil")} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">{t("vendors.contacts")}</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => contacts.append({ name: "", email: "", phone: "", isPrimary: contacts.fields.length === 0 })}
            >
              <Plus className="size-4" />
              {t("vendors.addContact")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {contacts.fields.map((c, i) => (
              <div key={c.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto] sm:items-end">
                <Field label={t("vendors.contactName")} htmlFor={`c-${i}-name`} error={e.contacts?.[i]?.name?.message}>
                  <Input id={`c-${i}-name`} className="h-10" {...form.register(`contacts.${i}.name`)} />
                </Field>
                <Field label={t("vendors.contactEmail")} htmlFor={`c-${i}-email`} error={e.contacts?.[i]?.email?.message}>
                  <Input id={`c-${i}-email`} type="email" className="h-10" {...form.register(`contacts.${i}.email`)} />
                </Field>
                <Field label={t("vendors.contactPhone")} htmlFor={`c-${i}-phone`} error={e.contacts?.[i]?.phone?.message}>
                  <Input id={`c-${i}-phone`} inputMode="tel" className="h-10" {...form.register(`contacts.${i}.phone`)} />
                </Field>
                <Controller
                  control={form.control}
                  name={`contacts.${i}.isPrimary`}
                  render={({ field }) => (
                    <div className="flex h-10 items-center gap-2">
                      <Checkbox id={`c-${i}-primary`} checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                      <Label htmlFor={`c-${i}-primary`}>{t("vendors.primary")}</Label>
                    </div>
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("vendors.removeContact")}
                  onClick={() => contacts.remove(i)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </fieldset>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("vendors.approved")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Controller
            control={form.control}
            name="isApproved"
            render={({ field }) => (
              <div className="flex min-h-11 items-center gap-3">
                <Checkbox id="isApproved" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                <Label htmlFor="isApproved">{t("vendors.approved")}</Label>
              </div>
            )}
          />
          <Field label={t("vendors.evaluationNotes")} htmlFor="evaluationNotes" optional hint={t("vendors.evaluationHint")}>
            <Textarea id="evaluationNotes" rows={3} {...form.register("evaluationNotes")} />
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
