import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  if ((await auth())?.user) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-sm border border-border bg-surface p-7 shadow-panel">
        <div className="mb-7">
          <Image src="/brand/logo-mark.png" alt="" width={44} height={44} className="mb-5 h-11 w-11 object-contain" priority />
          <h1 className="text-2xl font-semibold text-foreground">Weighbridge Control</h1>
          <p className="mt-1 text-sm text-muted-foreground">Secure manual weighbridge & mining operations</p>
        </div>
        <LoginForm />
        <div className="mt-4 flex items-center justify-between text-xs">
          <div></div>
          <Link href="/forgot-password" className="text-muted-foreground hover:underline">Forgot password?</Link>
        </div>
        <div className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground text-center">
          <p className="font-medium text-foreground/80 mb-1">Supported Roles</p>
          <div className="flex flex-wrap justify-center gap-1.5 text-2xs">
            <span className="rounded bg-muted px-2 py-0.5">Super Admin</span>
            <span className="rounded bg-muted px-2 py-0.5">Client Admin</span>
            <span className="rounded bg-muted px-2 py-0.5">Operator</span>
            <span className="rounded bg-muted px-2 py-0.5">Transporter</span>
          </div>
        </div>
      </div>
    </main>
  );
}
