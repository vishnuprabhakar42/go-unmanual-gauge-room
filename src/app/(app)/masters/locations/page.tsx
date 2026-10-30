import type { Metadata } from "next";
import { NodesPage } from "../nodes";

export const metadata: Metadata = { title: "Locations" };

export default function LocationsPage() {
  return <NodesPage kind="location" />;
}
