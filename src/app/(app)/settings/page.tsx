import { forbidden, redirect } from "next/navigation";
import { SETTINGS_ITEMS } from "@/components/shell/nav";
import { requireContext } from "@/server/context";

export default async function SettingsIndex() {
  const ctx = await requireContext();
  const first = SETTINGS_ITEMS.find((i) => ctx.can(i.permission));
  if (!first) forbidden();
  redirect(first.href);
}
