"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { Button, Input, Label } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: String(form.get("email")),
      password: String(form.get("password")),
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Correo o clave incorrectos.");
      return;
    }
    router.push(params.get("callbackUrl") || "/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-10">
      <div className="mb-8">
        <p
          className="text-4xl text-ink"
          style={{ fontFamily: "var(--font-brand), serif" }}
        >
          KN GOLD
        </p>
        <p className="mt-2 text-sm text-muted">
          Control de inventario y cotizaciones en tu celular.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-3xl border border-border bg-white p-5 shadow-sm">
        <div>
          <Label htmlFor="email">Correo</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            defaultValue="dueno@kngold.com.do"
            autoComplete="username"
          />
        </div>
        <div>
          <Label htmlFor="password">Clave</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            defaultValue="kngold2026"
            autoComplete="current-password"
          />
        </div>
        {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-muted">
        Demo: dueno@kngold.com.do o vendedor@kngold.com.do · kngold2026
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
