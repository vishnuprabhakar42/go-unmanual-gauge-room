import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CalendarClock,
  Check,
  ClipboardCheck,
  FileStack,
  Gauge,
  ShieldAlert,
  ShoppingCart,
  Truck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { BRAND } from "@/brand";
import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: { absolute: `${BRAND.company} · ${BRAND.product} — calibration management on autopilot` },
};

const FEATURES = [
  { icon: Gauge, k: "f1" },
  { icon: CalendarClock, k: "f2" },
  { icon: ShoppingCart, k: "f3" },
  { icon: Truck, k: "f4" },
  { icon: ClipboardCheck, k: "f5" },
  { icon: ShieldAlert, k: "f6" },
  { icon: FileStack, k: "f7" },
  { icon: BarChart3, k: "f8" },
] as const;

/** Public marketing page; signed-in users go straight to the app. */
export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  const t = await getTranslations("landing");
  const gradientText = "bg-gradient-to-r from-brand-sky via-brand-blue to-brand-violet bg-clip-text text-transparent";

  return (
    <div className="bg-background min-h-dvh">
      <header className="bg-background/90 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2" aria-label={BRAND.full}>
            <Logo className="size-9" />
            <span className="flex items-baseline gap-1.5">
              <span className="font-semibold">{BRAND.company}</span>
              <span className="text-muted-foreground text-sm">{BRAND.product}</span>
            </span>
          </Link>
          <nav className="text-muted-foreground ml-auto hidden items-center gap-6 text-sm md:flex" aria-label="Sections">
            <a href="#features" className="hover:text-foreground">
              {t("navFeatures")}
            </a>
            <a href="#how" className="hover:text-foreground">
              {t("navHow")}
            </a>
            <a href="#india" className="hover:text-foreground">
              {t("navIndia")}
            </a>
            <a href="#labs" className="hover:text-foreground">
              {t("navLabs")}
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-4">
            <Button asChild variant="ghost" className="h-11">
              <Link href="/login">{t("signIn")}</Link>
            </Button>
            <Button asChild className="hidden h-11 sm:inline-flex">
              <Link href="/register">{t("getStarted")}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="from-brand-sky/25 via-brand-blue/10 pointer-events-none absolute -top-40 right-[-10%] h-[520px] w-[720px] rounded-full bg-gradient-to-br to-transparent blur-3xl"
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:py-24 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              <p className="text-primary text-sm font-medium">{t("eyebrow")}</p>
              <h1 className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                {t("title1")} <span className={gradientText}>{t("title2")}</span>
              </h1>
              <p className="text-muted-foreground max-w-xl text-lg">{t("subtitle")}</p>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg" className="h-12 px-6">
                  <Link href="/register">
                    {t("ctaPrimary")}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 px-6">
                  <Link href="/login">{t("ctaSecondary")}</Link>
                </Button>
              </div>
              <ul className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {(["trust1", "trust2", "trust3"] as const).map((k) => (
                  <li key={k} className="flex items-center gap-1.5">
                    <Check className="text-primary size-4" aria-hidden="true" />
                    {t(k)}
                  </li>
                ))}
              </ul>
            </div>
            <ProductMock t={t} />
          </div>
        </section>

        <section id="features" className="bg-muted/40 scroll-mt-16 border-y">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
            <div className="max-w-2xl space-y-3">
              <h2 className="text-3xl font-semibold tracking-tight">{t("featuresTitle")}</h2>
              <p className="text-muted-foreground">{t("featuresSubtitle")}</p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(({ icon: Icon, k }) => (
                <div key={k} className="bg-card rounded-xl border p-5">
                  <div className="bg-primary/10 text-primary mb-4 inline-flex size-10 items-center justify-center rounded-lg">
                    <Icon className="size-5" aria-hidden="true" />
                  </div>
                  <h3 className="font-medium">{t(`${k}t`)}</h3>
                  <p className="text-muted-foreground mt-1.5 text-sm">{t(`${k}d`)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
            <div className="max-w-2xl space-y-3">
              <h2 className="text-3xl font-semibold tracking-tight">{t("howTitle")}</h2>
              <p className="text-muted-foreground">{t("howSubtitle")}</p>
            </div>
            <ol className="mt-10 grid gap-4 md:grid-cols-5">
              {(["s1", "s2", "s3", "s4", "s5"] as const).map((k, i) => (
                <li key={k} className="relative rounded-xl border p-5">
                  <span className="from-brand-sky to-brand-violet mb-3 inline-flex size-8 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white">
                    {i + 1}
                  </span>
                  <h3 className="font-medium">{t(`${k}t`)}</h3>
                  <p className="text-muted-foreground mt-1 text-sm">{t(`${k}d`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="india" className="bg-brand-navy scroll-mt-16 text-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2 md:py-20">
            <h2 className="text-3xl font-semibold tracking-tight">{t("indiaTitle")}</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {(["india1", "india2", "india3", "india4", "india5", "india6"] as const).map((k) => (
                <li key={k} className="flex items-start gap-2 text-sm text-white/85">
                  <BadgeCheck className="text-brand-sky mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {t(k)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="labs" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
            <div className="grid items-center gap-8 rounded-2xl border p-8 md:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight">{t("labsTitle")}</h2>
                <p className="text-muted-foreground max-w-2xl">{t("labsBody")}</p>
              </div>
              <Button asChild variant="outline" className="h-11">
                <Link href="/login">{t("signIn")}</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="px-4 pb-20">
          <div className="from-brand-blue to-brand-violet mx-auto max-w-6xl rounded-2xl bg-gradient-to-r px-8 py-12 text-white md:px-12">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <h2 className="text-3xl font-semibold tracking-tight">{t("ctaTitle")}</h2>
                <p className="text-white/85">{t("ctaBody")}</p>
              </div>
              <Button asChild size="lg" className="text-brand-navy h-12 bg-white px-6 hover:bg-white/90">
                <Link href="/register">
                  {t("ctaPrimary")}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="text-muted-foreground mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-8 text-sm">
          <Logo className="size-6" />
          <span>{t("footer", { year: new Date().getFullYear(), company: BRAND.company, product: BRAND.product })}</span>
        </div>
      </footer>
    </div>
  );
}

/** Illustrative product snapshot (styled HTML, not a screenshot). */
function ProductMock({ t }: { t: Awaited<ReturnType<typeof getTranslations<"landing">>> }) {
  const tiles = [
    { label: t("mockOverdue"), value: "0", tone: "text-emerald-600" },
    { label: t("mockPlanning"), value: "18", tone: "text-amber-600" },
    { label: t("mockAtLab"), value: "12", tone: "text-foreground" },
    { label: t("mockVerify"), value: "4", tone: "text-primary" },
  ];
  return (
    <div aria-hidden="true" className="bg-card relative rounded-2xl border p-5 shadow-xl shadow-blue-950/5">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium">{t("mockTitle")}</span>
        <span className="flex gap-1.5">
          <span className="bg-brand-sky size-2.5 rounded-full" />
          <span className="bg-brand-blue size-2.5 rounded-full" />
          <span className="bg-brand-violet size-2.5 rounded-full" />
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((x) => (
          <div key={x.label} className="rounded-xl border p-4">
            <div className="text-muted-foreground text-xs">{x.label}</div>
            <div className={`mt-1 text-3xl font-semibold tabular-nums ${x.tone}`}>{x.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {[72, 48, 88, 36, 60].map((w, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-muted-foreground w-10 text-xs">{["Nov", "Dec", "Jan", "Feb", "Mar"][i]}</span>
            <span className="from-brand-sky to-brand-blue h-2.5 rounded-full bg-gradient-to-r" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
      <div className="bg-muted/60 mt-4 flex items-center gap-3 rounded-xl p-3">
        <FileStack className="text-primary size-5" />
        <div className="text-sm">
          <div className="font-medium">{t("mockPack")}</div>
          <div className="text-muted-foreground text-xs">{t("mockPackDetail")}</div>
        </div>
      </div>
    </div>
  );
}
