"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Field } from "@/components/forms/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { registerSchema } from "@/domain/schemas";
import { registerAccount } from "../actions";

export function RegisterForm() {
  const t = useTranslations("auth");
  const [error, setError] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(registerSchema), defaultValues: { name: "", email: "", password: "" } });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const res = await registerAccount(values);
    if (!res) return;
    setError(
      res.error === "email_taken" ? t("emailTaken") : res.error === "rate_limited" ? t("rateLimited") : t("invalidCredentials"),
    );
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("registerTitle")}</CardTitle>
        <CardDescription>{t("registerSubtitle")}</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field label={t("name")} error={errors.name?.message} htmlFor="name">
            <Input id="name" autoComplete="name" className="h-11" {...form.register("name")} />
          </Field>
          <Field label={t("email")} error={errors.email?.message} htmlFor="email">
            <Input id="email" type="email" autoComplete="email" className="h-11" {...form.register("email")} />
          </Field>
          <Field label={t("password")} error={errors.password?.message} htmlFor="password">
            <Input id="password" type="password" autoComplete="new-password" className="h-11" {...form.register("password")} />
          </Field>
          <Button type="submit" className="h-11 w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t("signingIn") : t("register")}
          </Button>
        </CardContent>
      </form>
      <CardFooter className="justify-center text-sm">
        <span className="text-muted-foreground mr-1">{t("haveAccount")}</span>
        <Link href="/login" className="font-medium underline-offset-4 hover:underline">
          {t("signIn")}
        </Link>
      </CardFooter>
    </Card>
  );
}
