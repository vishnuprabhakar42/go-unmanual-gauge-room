"use client";

import { UserPlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { inviteVendorUserAction, revokeVendorUserAction } from "../actions";

export function PortalUsers({
  vendorId,
  users,
  editable,
}: {
  vendorId: string;
  users: { id: string; name: string | null; email: string }[];
  editable: boolean;
}) {
  const t = useTranslations("vendors");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("portalUsers")}</CardTitle>
        <p className="text-muted-foreground text-sm">{t("portalHint")}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {users.length === 0 && <p className="text-muted-foreground text-sm">{t("noPortalUsers")}</p>}
        <ul className="divide-y" data-testid="portal-users">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                <span className="font-medium">{u.name ?? u.email}</span> <span className="text-muted-foreground">{u.email}</span>
              </span>
              {editable && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  aria-label={`${t("revoke")} ${u.email}`}
                  onClick={() =>
                    start(async () => {
                      const res = await revokeVendorUserAction({ vendorId, vendorUserId: u.id });
                      if (!res.ok) toast.error(res.error);
                    })
                  }
                >
                  <X className="size-4" />
                  {t("revoke")}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {editable && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              aria-label={t("userName")}
              placeholder={t("userName")}
              className="h-10"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              aria-label={t("userEmail")}
              placeholder={t("userEmail")}
              type="email"
              className="h-10"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button
              className="h-10"
              disabled={pending || !email}
              onClick={() =>
                start(async () => {
                  const res = await inviteVendorUserAction({ vendorId, name, email });
                  if (!res.ok) return void toast.error(res.error);
                  toast.success(t("invited"));
                  setName("");
                  setEmail("");
                })
              }
            >
              <UserPlus className="size-4" />
              {t("inviteUser")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
