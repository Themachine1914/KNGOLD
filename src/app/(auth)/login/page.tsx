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
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const res = await signIn("credentials", {
        email: String(form.get("email")),
        password: String(form.get("password")),
        redirect: false,
      });
      if (res?.error) {
        setError("Correo o clave incorrectos.");
        return;
      }
      router.push(params.get("callbackUrl") || "/dashboard");
      router.refresh();
    } catch {
      setError("Sin conexión. Revisa el internet e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-10">
      <div className="mb-8">
        <div className="mb-4 inline-flex rounded-[22%] bg-background p-3 shadow-sm ring-1 ring-border/60">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo.png"
            alt="KN GOLD"
            width={96}
            height={96}
            className="h-24 w-24 object-contain"
          />
        </div>
        <p
          className="text-4xl text-ink"
          style={{ fontFamily: "var(--font-brand), serif" }}
        >
          KN <span className="text-gold-dark">GOLD</span>
        </p>
        <p className="mt-2 text-sm text-muted">
          Control de inventario y pedidos en tu celular.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-3xl border border-border bg-white p-5 shadow-sm"
      >
        <div>
          <Label htmlFor="email">Correo</Label>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            required
            autoComplete="username"
            placeholder="tu@kngold.com.do"
          />
        </div>
        <div>
          <Label htmlFor="password">Clave</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              className="pr-20"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 px-3 text-xs font-medium tracking-wide text-muted"
            >
              {showPassword ? "Ocultar" : "Ver"}
            </button>
          </div>
        </div>
        {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
        <Button type="submit" variant="gold" className="w-full" loading={loading}>
          {loading ? "Entrando…" : "Entrar"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        ¿Olvidaste tu clave? Pídesela al dueño.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-dvh w-full max-w-lg items-center justify-center px-5">
          <p className="text-sm text-muted">Cargando…</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
