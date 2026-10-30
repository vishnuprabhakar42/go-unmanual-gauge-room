import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/data/page-header";
import { SearchInput } from "@/components/data/search-input";
import { requirePermission } from "@/server/context";
import { listMembers } from "@/server/services/users";
import { tenantDb } from "@/server/tenant";
import { InviteUserDialog } from "./invite-user-dialog";
import { UsersTable } from "./users-table";

export const metadata: Metadata = { title: "Users & roles" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requirePermission("user.manage");
  const t = await getTranslations("users");
  const { q } = await searchParams;
  const members = await listMembers(tenantDb(ctx.tenant), ctx.org.id, { q: q?.trim() });
  const rows = members.map((u) => ({
    id: u.id,
    name: u.name ?? u.email,
    email: u.email,
    isYou: u.id === ctx.user.id,
    roles: u.memberships.map((m) => ({ id: m.id, role: m.role, plant: m.plant ? m.plant.code : null })),
  }));
  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={<InviteUserDialog plants={ctx.plants} />} />
      <div className="mb-4">
        <SearchInput placeholder={t("email")} />
      </div>
      <UsersTable rows={rows} />
    </>
  );
}
