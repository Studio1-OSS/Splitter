"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { authClient } from "@/lib/auth-client";

/** Only allow same-site relative redirects. */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const { error } =
      mode === "sign-up"
        ? await authClient.signUp.email({ name: String(form.get("name") ?? "").trim(), email, password })
        : await authClient.signIn.email({ email, password });
    if (error) {
      setPending(false);
      setError(error.message ?? "Something went wrong");
      return;
    }
    router.push(next);
    router.refresh();
  }

  const other = mode === "sign-in" ? "/sign-up" : "/sign-in";
  const otherHref = params.get("next") ? `${other}?next=${encodeURIComponent(next)}` : other;

  return (
    <div>
      <h1 className="text-4xl">{mode === "sign-in" ? "Welcome back" : "Create your account"}</h1>
      <p className="mt-2 text-muted-foreground">
        {mode === "sign-in" ? "Sign in to see your groups and balances." : "Free forever. Takes ten seconds."}
      </p>
      <form onSubmit={onSubmit} className="mt-8 grid gap-4">
        {mode === "sign-up" && (
          <Field label="Your name" hint="This is how friends will see you.">
            <Input name="name" required maxLength={60} autoComplete="name" placeholder="Alex Kim" />
          </Field>
        )}
        <Field label="Email">
          <Input name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
        </Field>
        <Field label="Password" hint={mode === "sign-up" ? "At least 8 characters." : undefined}>
          <Input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          />
        </Field>
        {error && <p className="rounded-xs bg-negative-soft px-3 py-2 text-sm text-negative">{error}</p>}
        <Button type="submit" size="lg" loading={pending} className="mt-2">
          {mode === "sign-in" ? "Sign in" : "Create account"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {mode === "sign-in" ? "New here? " : "Already have an account? "}
        <Link href={otherHref} className="font-medium text-foreground underline-offset-4 hover:underline">
          {mode === "sign-in" ? "Create an account" : "Sign in"}
        </Link>
      </p>
      <p className="mt-3 text-center text-sm text-muted-foreground">
        Just splitting once?{" "}
        <Link href="/split" className="text-foreground underline underline-offset-4">
          Continue without an account
        </Link>
      </p>
    </div>
  );
}
