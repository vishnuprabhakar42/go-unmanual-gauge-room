import { AppShell } from "@/components/shell/app-shell";
import { requireContext } from "@/server/context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  return <AppShell ctx={ctx}>{children}</AppShell>;
}
