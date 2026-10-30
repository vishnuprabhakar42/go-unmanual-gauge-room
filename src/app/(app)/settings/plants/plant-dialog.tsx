"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { plantSchema } from "@/domain/schemas";
import { createPlantAction, updatePlantAction } from "./actions";
import type { PlantRow } from "./plants-table";

export function PlantDialog({ mode, plant }: { mode: "create" | "edit"; plant?: PlantRow }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const form = useForm({
    resolver: zodResolver(plantSchema),
    defaultValues: { name: plant?.name ?? "", code: plant?.code ?? "", gstin: plant?.gstin ?? "", address: plant?.address ?? "" },
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    const res = mode === "create" ? await createPlantAction(values) : await updatePlantAction({ ...values, id: plant!.id });
    if (!res.ok) {
      for (const [field, msgs] of Object.entries(res.fieldErrors ?? {})) {
        if (msgs?.[0]) form.setError(field as keyof typeof values, { message: msgs[0] });
      }
      toast.error(res.error);
      return;
    }
    toast.success(t("common.saved"));
    setOpen(false);
    if (mode === "create") form.reset();
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button className="h-10">
            <Plus className="size-4" />
            {t("plants.add")}
          </Button>
        ) : (
          <Button variant="ghost" size="sm">
            {t("common.edit")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{mode === "create" ? t("plants.addTitle") : t("plants.editTitle")}</DialogTitle>
            <DialogDescription>{t("plants.subtitle")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("plants.name")} htmlFor="plant-name" error={e.name?.message} className="sm:col-span-2">
              <Input id="plant-name" className="h-11" {...form.register("name")} />
            </Field>
            <Field label={t("plants.code")} htmlFor="plant-code" error={e.code?.message}>
              <Input id="plant-code" className="h-11 uppercase" maxLength={4} {...form.register("code")} />
            </Field>
            <Field label={t("plants.gstin")} htmlFor="plant-gstin" optional error={e.gstin?.message} className="sm:col-span-3">
              <Input id="plant-gstin" className="h-11 uppercase" maxLength={15} {...form.register("gstin")} />
            </Field>
            <Field label={t("plants.address")} htmlFor="plant-address" optional className="sm:col-span-3">
              <Textarea id="plant-address" rows={2} {...form.register("address")} />
            </Field>
          </div>
          <p className="text-muted-foreground text-xs">{t("setup.plantCodeHint")}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
