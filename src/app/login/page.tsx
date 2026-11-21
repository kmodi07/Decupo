import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { Card, CupiMark, Wordmark } from "@/components/ui";
import { getCurrentUser } from "@/server/auth/current";

export const metadata = { title: "Log in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/app");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8">
      <Wordmark />
      <div className="my-auto py-10">
        <CupiMark size={72} className="mb-4" />
        <h1 className="text-[32px] font-bold tracking-tight">Welcome back</h1>
        <p className="mb-6 mt-1 text-[15px] text-mute">Your missions kept running while you were away.</p>
        <Card>
          <Suspense>
            <AuthForm mode="login" />
          </Suspense>
        </Card>
        <p className="mt-4 text-[14px] text-mute">
          New here?{" "}
          <Link href="/signup" className="font-semibold text-lavender-deep underline-offset-2 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
