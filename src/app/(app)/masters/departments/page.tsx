import type { Metadata } from "next";
import { NodesPage } from "../nodes";

export const metadata: Metadata = { title: "Departments" };

export default function DepartmentsPage() {
  return <NodesPage kind="department" />;
}
