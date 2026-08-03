"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const ownerLinks = [
  { href: "/dashboard", label: "Inicio" },
  { href: "/inventory", label: "Stock" },
  { href: "/movements", label: "Movim." },
  { href: "/imports", label: "Pedidos" },
  { href: "/quotes", label: "Cotiz." },
];

const sellerLinks = [
  { href: "/dashboard", label: "Inicio" },
  { href: "/inventory", label: "Stock" },
  { href: "/imports", label: "Pedidos" },
  { href: "/quotes", label: "Cotiz." },
  { href: "/quotes/new", label: "Nueva" },
];

function isActive(pathname: string, href: string) {
  if (href === "/quotes/new") return pathname === "/quotes/new";
  if (href === "/quotes") {
    return pathname.startsWith("/quotes") && pathname !== "/quotes/new";
  }
  if (href === "/imports") return pathname.startsWith("/imports");
  if (href === "/movements") return pathname.startsWith("/movements");
  if (href === "/inventory") return pathname.startsWith("/inventory");
  return pathname === href;
}

export function BottomNav({ role }: { role: "OWNER" | "SELLER" }) {
  const pathname = usePathname();
  const links = role === "OWNER" ? ownerLinks : sellerLinks;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 backdrop-blur">
      <div
        className={`mx-auto grid max-w-lg gap-1 px-1.5 pb-[env(safe-area-inset-bottom)] pt-2 ${
          links.length === 5 ? "grid-cols-5" : "grid-cols-4"
        }`}
      >
        {links.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center rounded-xl px-1 py-2 text-[10px] font-semibold ${
                active ? "bg-ink text-white" : "text-muted"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function TopBar({
  name,
  role,
}: {
  name?: string | null;
  role: "OWNER" | "SELLER";
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-[#151311] text-white">
      <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
        <div>
          <p
            className="text-xl leading-none tracking-wide"
            style={{ fontFamily: "var(--font-brand), serif" }}
          >
            KN GOLD
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-white/55">
            {role === "OWNER" ? "Dueño" : "Vendedor"} · {name}
          </p>
        </div>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/80"
        >
          Salir
        </button>
      </div>
    </header>
  );
}
