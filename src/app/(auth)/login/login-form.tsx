"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Mail } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { loginWithPassword, sendMagicLink, type AuthFormResult } from "../actions";

const schema = z.object({ email: z.string().trim().email(), password: z.string() });

export function LoginForm({ callbackUrl, initialError }: { callbackUrl?: string; initialError?: string }) {
  const t = useTranslations("auth");
  const [error, setError] = useState<string | null>(
    initialError === "rate_limited" ? t("rateLimited") : initialError ? t("linkFailed") : null,
  );
  const [linkPending, startLink] = useTransition();
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  // Marks the form interactive (tests wait for this instead of racing hydration on slow machines).
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const showError = (res: AuthFormResult) => {
    if (!res) return;
    setError(
      res.error === "rate_limited" ? t("rateLimited") : res.error === "link_failed" ? t("linkFailed") : t("invalidCredentials"),
    );
  };

  const onPassword = form.handleSubmit(async (values) => {
    setError(null);
    if (!values.password) return form.setError("password", { message: t("invalidCredentials") });
    showError(await loginWithPassword({ ...values, callbackUrl }));
  });

  const onMagicLink = () => {
    setError(null);
    const email = form.getValues("email");
    if (!z.string().email().safeParse(email.trim()).success) {
      form.setError("email", { message: t("email") });
      return;
    }
    startLink(async () => showError(await sendMagicLink({ email, callbackUrl })));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("signInTitle")}</CardTitle>
        <CardDescription>{t("signInSubtitle")}</CardDescription>
      </CardHeader>
      <form onSubmit={onPassword} noValidate data-hydrated={hydrated || undefined}>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field label={t("email")} error={form.formState.errors.email?.message} htmlFor="email">
            <Input id="email" type="email" autoComplete="email" inputMode="email" className="h-11" {...form.register("email")} />
          </Field>
          <Field label={t("password")} error={form.formState.errors.password?.message} htmlFor="password">
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              className="h-11"
              {...form.register("password")}
            />
          </Field>
          <Button type="submit" className="h-11 w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t("signingIn") : t("signIn")}
          </Button>
          <div className="text-muted-foreground flex items-center gap-3 text-xs uppercase">
            <span className="bg-border h-px flex-1" />
            {t("or")}
            <span className="bg-border h-px flex-1" />
          </div>
          <Button type="button" variant="outline" className="h-11 w-full" onClick={onMagicLink} disabled={linkPending}>
            <Mail className="size-4" />
            {linkPending ? t("sendingLink") : t("emailMeLink")}
          </Button>
        </CardContent>
      </form>
      <CardFooter className="justify-center text-sm">
        <span className="text-muted-foreground mr-1">{t("noAccount")}</span>
        <Link href="/register" className="font-medium underline-offset-4 hover:underline">
          {t("createAccount")}
        </Link>
      </CardFooter>
    </Card>
  );
}
