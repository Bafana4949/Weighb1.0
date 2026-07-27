import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  if ((await auth())?.user) redirect("/");
  return <main className="flex min-h-screen items-center justify-center bg-background p-4"><div className="w-full max-w-md rounded-sm border border-border bg-surface p-7 shadow-panel"><div className="mb-7"><Image src="/brand/logo-mark.png" alt="" width={44} height={44} className="mb-5 h-11 w-11 object-contain" priority /><h1 className="text-2xl font-semibold text-foreground">Weighbridge Control</h1><p className="mt-1 text-sm text-muted-foreground">Secure mining access and weighing operations</p></div><LoginForm /><div className="mt-4 flex items-center justify-between text-xs"><Link href="/apply" className="text-primary hover:underline">Apply as a transporter</Link><Link href="/forgot-password" className="text-muted-foreground hover:underline">Forgot password?</Link></div><div className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground"><p>Demo: admin, operator, security, or transporter</p><p>@weighbridge.local · Password123!</p></div></div></main>;
}
