import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ResetPasswordForm } from "@/components/reset-password-form";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  if ((await auth())?.user) redirect("/");
  const { token } = await searchParams;
  return <main className="flex min-h-screen items-center justify-center bg-background p-4">
    <div className="w-full max-w-md rounded-sm border border-border bg-surface p-7 shadow-panel">
      <div className="mb-7">
        <Image src="/brand/logo-mark.png" alt="" width={44} height={44} className="mb-5 h-11 w-11 object-contain" priority />
        <h1 className="text-2xl font-semibold text-foreground">Set a new password</h1>
      </div>
      {token ? <ResetPasswordForm token={token} /> : <p className="rounded-sm border border-danger/30 bg-danger/10 p-3 text-sm text-danger">This link is missing its reset token. Request a new one.</p>}
      <div className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
        <Link href="/forgot-password" className="text-primary hover:underline">Request a new link</Link> · <Link href="/login" className="text-primary hover:underline">Back to sign in</Link>
      </div>
    </div>
  </main>;
}
