import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function TransporterPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  redirect("/transporter/fleet");
}
