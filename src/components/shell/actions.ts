"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import { PLANT_COOKIE, getAppContext } from "@/server/context";

/** Remembers the plant picked in the switcher (UI preference, not a business record). */
export async function selectPlant(plantId: string | null) {
  const ctx = await getAppContext();
  if (!ctx) return;
  const store = await cookies();
  if (plantId && ctx.plants.some((p) => p.id === plantId)) {
    store.set(PLANT_COOKIE, plantId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  } else {
    store.delete(PLANT_COOKIE);
  }
  revalidatePath("/", "layout");
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
