import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TransporterApplyForm } from "@/components/transporter-apply-form";

export default async function ApplyPage() {
  if ((await auth())?.user) redirect("/");
  return <main className="flex min-h-screen items-center justify-center bg-background p-4">
    <div className="w-full max-w-lg rounded-sm border border-border bg-surface p-7 shadow-panel">
      <div className="mb-7">
        <Image src="/brand/logo-mark.png" alt="" width={44} height={44} className="mb-5 h-11 w-11 object-contain" priority />
        <h1 className="text-2xl font-semibold text-foreground">Apply as a transporter</h1>
        <p className="mt-1 text-sm text-muted-foreground">Register your haulage company to book trucks onto the weighbridge. An administrator reviews every application before it's active.</p>
      </div>
      <TransporterApplyForm />
      <div className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
        <p>Already registered? <Link href="/login" className="text-primary hover:underline">Sign in</Link></p>
      </div>
    </div>
  </main>;
}
