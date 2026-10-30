import { MailCheck } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function CheckEmailPage() {
  const t = await getTranslations("auth");
  return (
    <Card className="text-center">
      <CardHeader className="items-center">
        <MailCheck className="text-primary mx-auto size-10" />
        <CardTitle className="text-xl">{t("checkEmailTitle")}</CardTitle>
        <CardDescription>{t("checkEmailBody")}</CardDescription>
        <Link href="/login" className="mt-2 text-sm font-medium underline-offset-4 hover:underline">
          {t("backToSignIn")}
        </Link>
      </CardHeader>
    </Card>
  );
}
