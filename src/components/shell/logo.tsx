import Image from "next/image";
import { BRAND } from "@/brand";
import { cn } from "@/lib/utils";

/** Go Unmanual mark on its own light tile (so the dark "G" also reads in dark mode). */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn("relative inline-block shrink-0 overflow-hidden rounded-[22%] bg-[#f5f4ef] ring-1 ring-black/5", className)}
    >
      <Image src={BRAND.mark} alt="" fill sizes="96px" className="object-contain" priority />
    </span>
  );
}
