"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INTERNAL_ROLES } from "@/domain/rbac";
import { inviteUserSchema } from "@/domain/schemas";
import { inviteUserAction } from "./actions";

const ALL = "__all__";
const schema = inviteUserSchema.extend({ password: z.string().optional() });

export function InviteUserDialog({ plants }: { plants: { id: string; name: string; code: string }[] }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", role: "GAUGE_INCHARGE", plantId: "", phone: "", password: "" },
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    const res = await inviteUserAction({ ...values, plantId: values.plantId ?? "" });
    if (!res.ok) {
      for (const [field, msgs] of Object.entries(res.fieldErrors ?? {})) {
        if (msgs?.[0]) form.setError(field as keyof z.input<typeof schema>, { message: msgs[0] });
      }
      toast.error(res.error);
      return;
    }
    toast.success(t("users.invited"));
    form.reset();
    setOpen(false);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-10">
          <UserPlus className="size-4" />
          {t("users.invite")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("users.inviteTitle")}</DialogTitle>
            <DialogDescription>{t("users.inviteBody")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("users.name")} htmlFor="u-name" error={e.name?.message}>
              <Input id="u-name" className="h-11" {...form.register("name")} />
            </Field>
            <Field label={t("users.email")} htmlFor="u-email" error={e.email?.message}>
              <Input id="u-email" type="email" className="h-11" {...form.register("email")} />
            </Field>
            <Field label={t("users.role")} htmlFor="u-role" error={e.role?.message}>
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="u-role" className="h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTERNAL_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {t(`roles.${r}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label={t("users.plant")} htmlFor="u-plant" error={e.plantId?.message}>
              <Controller
                control={form.control}
                name="plantId"
                render={({ field }) => (
                  <Select value={field.value ? field.value : ALL} onValueChange={(v) => field.onChange(v === ALL ? "" : v)}>
                    <SelectTrigger id="u-plant" className="h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>{t("common.allPlants")}</SelectItem>
                      {plants.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.code} · {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label={t("users.phone")} htmlFor="u-phone" optional hint={t("users.phoneHint")}>
              <Input id="u-phone" inputMode="tel" className="h-11" {...form.register("phone")} />
            </Field>
            <Field label={t("users.initialPassword")} htmlFor="u-password" optional error={e.password?.message}>
              <Input
                id="u-password"
                type="password"
                autoComplete="new-password"
                className="h-11"
                {...form.register("password")}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t("common.saving") : t("users.invite")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
