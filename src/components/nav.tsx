"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { NotificationsBell } from "@/components/notifications-bell";
import { isOpsManager, isOwner, roleLabel } from "@/lib/roles";
import type { Role } from "@/lib/types";

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    home: "M4 10.8 12 4.5l8 6.3V20H4z",
    stock: "M3 7.5 12 3l9 4.5-9 4.5-9-4.5Zm0 4.5 9 4.5 9-4.5M3 16.5 12 21l9-4.5",
    movements: "M4 7h16M4 12h10M4 17h13",
    imports: "M2 8h11v8H2zM13 11h4l4 3v2h-8zM6.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
    quotes: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5",
    new: "M12 5v14M5 12h14",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

const ownerLinks = [
  { href: "/dashboard", label: "Inicio", icon: "home" },
  { href: "/inventory", label: "Stock", icon: "stock" },
  { href: "/movements", label: "Movim.", icon: "movements", full: "Movimientos" },
  { href: "/imports", label: "Importaciones", icon: "imports" },
  { href: "/quotes", label: "Pedido", icon: "quotes", full: "Pedidos" },
];

const sellerLinks = [
  { href: "/dashboard", label: "Inicio", icon: "home" },
  { href: "/inventory", label: "Stock", icon: "stock" },
  { href: "/imports", label: "Importaciones", icon: "imports" },
  { href: "/quotes", label: "Pedido", icon: "quotes", full: "Pedidos" },
  { href: "/quotes/new", label: "Nuevo pedido", icon: "new", full: "Nuevo pedido", cta: true },
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

export function BottomNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const links = isOpsManager(role) ? ownerLinks : sellerLinks;

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 backdrop-blur"
    >
      <div
        className={`mx-auto grid max-w-lg gap-1 px-1.5 pb-[env(safe-area-inset-bottom)] pt-1.5 ${
          links.length === 5 ? "grid-cols-5" : "grid-cols-4"
        }`}
      >
        {links.map((link) => {
          const active = isActive(pathname, link.href);
          const cta = "cta" in link && link.cta;
          const tone = cta
            ? active
              ? "bg-gold-dark text-white"
              : "bg-gold text-ink"
            : active
              ? "bg-ink text-white"
              : "text-muted";
          return (
            <Link
              key={link.href}
              href={link.href}
              prefetch={false}
              aria-current={active ? "page" : undefined}
              aria-label={"full" in link ? link.full : link.label}
              className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1.5 font-semibold leading-tight ${
                cta ? "text-[9px]" : "text-[10px]"
              } ${tone}`}
            >
              <Icon name={link.icon} />
              <span className="text-center">{link.label}</span>
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
  role: Role;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-[#151311] text-white">
      <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
        <div>
          <p
            className="text-xl leading-none tracking-wide"
            style={{ fontFamily: "var(--font-brand), serif" }}
          >
            KN <span className="text-gold">GOLD</span>
          </p>
          <p className="mt-1 text-[11px] tracking-wide text-white/75">
            {roleLabel(role)} · {name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NotificationsBell />
          {isOwner(role) ? (
            <Link
              href="/settings"
              prefetch={false}
              className="min-h-11 rounded-lg border border-white/25 px-3 py-1.5 text-xs font-semibold text-white"
            >
              Configuración
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="min-h-11 rounded-lg border border-white/25 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}
