import { redirect } from "next/navigation";
import { requireAnyPermission } from "@/server/context";

export default async function PurchaseIndex() {
  const ctx = await requireAnyPermission("po.manage", "rfq.manage", "rateContract.manage", "quote.techApprove");
  redirect(ctx.can("po.manage") ? "/purchase/orders" : "/purchase/rfqs");
}
