import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export default async function ForgotPasswordPage() {
  if ((await auth())?.user) redirect("/");
  return <main className="flex min-h-screen items-center justify-center bg-background p-4">
    <div className="w-full max-w-md rounded-sm border border-border bg-surface p-7 shadow-panel">
      <div className="mb-7">
        <Image src="/brand/logo-mark.png" alt="" width={44} height={44} className="mb-5 h-11 w-11 object-contain" priority />
        <h1 className="text-2xl font-semibold text-foreground">Reset your password</h1>
        <p className="mt-1 text-sm text-muted-foreground">Enter your email and we'll send you a reset link.</p>
      </div>
      <ForgotPasswordForm />
      <div className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
        <Link href="/login" className="text-primary hover:underline">Back to sign in</Link>
      </div>
    </div>
  </main>;
}
