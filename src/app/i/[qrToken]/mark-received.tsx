"use client";

import { PackageCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { receiveByScanAction } from "@/app/(app)/dispatch/actions";

/** Stores scans the label when the instrument comes back and confirms receipt on the phone. */
export function MarkReceivedButton({ token }: { token: string }) {
  const t = useTranslations("qr");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      className="h-12 w-full text-base"
      disabled={pending}
      data-testid="mark-received"
      onClick={() =>
        start(async () => {
          const res = await receiveByScanAction({ scanned: token });
          if (!res.ok) return void toast.error(res.error);
          toast.success(t("receivedMsg"));
          router.refresh();
        })
      }
    >
      <PackageCheck className="size-5" />
      {t("markReceived")}
    </Button>
  );
}
