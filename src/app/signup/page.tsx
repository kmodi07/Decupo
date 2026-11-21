import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { Card, CupiMark, Wordmark } from "@/components/ui";
import { getCurrentUser } from "@/server/auth/current";

export const metadata = { title: "Sign up" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/app");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8">
      <Wordmark />
      <div className="my-auto py-10">
        <CupiMark size={72} className="mb-4" />
        <h1 className="text-[32px] font-bold tracking-tight">Meet Cupi</h1>
        <p className="mb-6 mt-1 text-[15px] text-mute">You start with 100 Explore credits. No card, no connections, nothing runs without your go-ahead.</p>
        <Card>
          <Suspense>
            <AuthForm mode="signup" />
          </Suspense>
        </Card>
        <p className="mt-4 text-[14px] text-mute">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-lavender-deep underline-offset-2 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
