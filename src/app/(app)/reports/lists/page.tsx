import { Download } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/server/context";
import { plantLabel } from "../plant-label";

export const metadata: Metadata = { title: "Registers" };

export default async function ListsPage() {
  const ctx = await requirePermission("report.view");
  const t = await getTranslations("reports");
  const items = [
    { title: t("masterList"), hint: t("masterHint"), href: "/api/instruments/export", id: "master" },
    { title: t("dueList"), hint: t("dueHint"), href: "/api/reports/due", id: "due" },
  ];
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("listsTitle")}</h1>
        <p className="text-muted-foreground text-sm">
          {t("listsSubtitle")} {t("plantNote", { plant: plantLabel(ctx, t("allPlants")) })}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((i) => (
          <Card key={i.id}>
            <CardHeader>
              <CardTitle className="text-base">{i.title}</CardTitle>
              <CardDescription>{i.hint}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="h-11">
                <a href={i.href} data-testid={`export-${i.id}`}>
                  <Download aria-hidden="true" />
                  {t("export")}
                </a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
