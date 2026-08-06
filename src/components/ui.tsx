import { type ReactNode } from "react";
import { formatRD } from "@/lib/pricing";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-border bg-card p-4 shadow-[0_1px_0_rgba(21,19,17,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "gold" | "success" | "danger" | "warn";
  className?: string;
}) {
  const tones = {
    neutral: "bg-ink/8 text-ink ring-1 ring-border",
    gold: "bg-gold/20 text-gold-dark",
    success: "bg-success/10 text-success",
    danger: "bg-danger/10 text-danger",
    warn: "bg-warn/10 text-warn",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md px-2.5 py-1 text-[13px] font-semibold ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  variant = "primary",
  loading = false,
  className = "",
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "gold" | "secondary" | "danger" | "ghost";
  loading?: boolean;
}) {
  const variants = {
    primary: "bg-ink text-white hover:bg-ink/90",
    gold: "bg-gold text-ink hover:bg-gold-dark hover:text-white",
    secondary: "bg-white border border-border text-ink hover:bg-border/30",
    danger: "bg-danger text-white hover:bg-danger/90",
    ghost: "bg-transparent text-muted hover:text-ink",
  };
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`min-h-11 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-gold/30 focus:ring-2 ${className}`}
      {...props}
    />
  );
}

export function Label({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-muted">
      {children}
    </label>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-white/60 px-4 py-10 text-center">
      <p className="font-semibold text-ink">{title}</p>
      {body ? <p className="mt-1 text-sm text-muted">{body}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/**
 * Cifras de dinero. Siempre tabulares para que las columnas alineen.
 * `size` sigue la escala acordada: hero = total de cotización, strong = KPI.
 */
export function Money({
  amount,
  size = "base",
  className = "",
}: {
  amount: number;
  size?: "hero" | "strong" | "base";
  className?: string;
}) {
  const sizes = {
    hero: "text-3xl font-semibold text-ink",
    strong: "text-2xl font-semibold text-ink",
    base: "text-base",
  };
  return (
    <span className={`tabular-nums ${sizes[size]} ${className}`}>
      {formatRD(amount)}
    </span>
  );
}

/** Barra fija sobre la BottomNav para la acción principal de un flujo. */
export function StickyBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-[62px] z-30 border-t border-border bg-card/95 backdrop-blur">
      <div className="mx-auto max-w-lg px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </div>
  );
}
