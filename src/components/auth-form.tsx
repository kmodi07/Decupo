"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { Button, Field, Notice } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      await api(mode === "login" ? "/api/auth/login" : "/api/auth/signup", { json: data });
      const goal = params.get("goal");
      router.push(goal ? `/app?goal=${encodeURIComponent(goal)}` : "/app");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {mode === "signup" && <Field label="Your name" name="name" autoComplete="name" required maxLength={120} />}
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        required
        minLength={mode === "signup" ? 10 : 1}
        hint={mode === "signup" ? "At least 10 characters. A short sentence works well." : undefined}
      />
      {mode === "signup" && <Field label="Workspace name" name="orgName" placeholder="Optional" maxLength={120} />}
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "One moment" : mode === "login" ? "Log in" : "Create account"}
      </Button>
    </form>
  );
}
