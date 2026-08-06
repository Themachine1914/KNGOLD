"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ManagedUser, SeatInfo } from "@/lib/users-types";
import { Badge, Button, Card, EmptyState, Input, Label } from "@/components/ui";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function UsersAdminPanel({
  initialUsers,
  initialSeats,
  currentUserId,
}: {
  initialUsers: ManagedUser[];
  initialSeats: SeatInfo;
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [users, setUsers] = useState(initialUsers);
  const [seats, setSeats] = useState(initialSeats);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"SELLER" | "ADMIN">("SELLER");

  const [supportEmail, setSupportEmail] = useState("");
  const [supportPassword, setSupportPassword] = useState("");
  const [supportHours, setSupportHours] = useState(48);
  const [createdCreds, setCreatedCreds] = useState<{
    email: string;
    password: string;
    label: string;
  } | null>(null);

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOkMsg("");
    setCreatedCreds(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "No se pudo crear");
      return;
    }
    setUsers((prev) => {
      const next = [data.user as ManagedUser, ...prev.filter((u) => u.id !== data.user.id)];
      return next;
    });
    if (data.seats) setSeats(data.seats);
    setCreatedCreds({
      email: data.user.email,
      password,
      label: "Usuario creado",
    });
    setName("");
    setEmail("");
    setPassword("");
    setRole("SELLER");
    setOkMsg(
      role === "ADMIN" ? "Administrador creado." : "Vendedor creado."
    );
    refresh();
  }

  async function createSupport(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOkMsg("");
    setCreatedCreds(null);
    const res = await fetch("/api/users/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: supportEmail,
        password: supportPassword,
        hours: supportHours,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "No se pudo crear el acceso");
      return;
    }
    setUsers((prev) => [data.user as ManagedUser, ...prev.filter((u) => u.id !== data.user.id)]);
    if (data.seats) setSeats(data.seats);
    setCreatedCreds({
      email: data.user.email,
      password: supportPassword,
      label: "Acceso temporal de soporte",
    });
    setSupportEmail("");
    setSupportPassword("");
    setOkMsg("Acceso temporal listo. Guarde la contraseña; no se vuelve a mostrar.");
    refresh();
  }

  async function toggleActive(u: ManagedUser, active: boolean) {
    setError("");
    setOkMsg("");
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "No se pudo actualizar");
      return;
    }
    setUsers((prev) => prev.map((x) => (x.id === u.id ? (data.user as ManagedUser) : x)));
    if (data.seats) setSeats(data.seats);
    setOkMsg(active ? "Usuario reactivado." : "Usuario desactivado.");
    refresh();
  }

  async function revokeSupport(u: ManagedUser) {
    setError("");
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revokeSupport: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "No se pudo revocar");
      return;
    }
    setUsers((prev) => prev.map((x) => (x.id === u.id ? (data.user as ManagedUser) : x)));
    if (data.seats) setSeats(data.seats);
    setOkMsg("Acceso de soporte revocado.");
    refresh();
  }

  const atLimit = seats.remaining <= 0;

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm font-semibold text-ink">Cupo del plan</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {seats.used} / {seats.maxUsers}
        </p>
        <p className="mt-1 text-sm text-muted">
          Usuarios del plan (vendedores y administradores), además del dueño. El
          administrador opera igual que el dueño excepto Configuración. El acceso de
          soporte no consume cupo.
          {atLimit
            ? " Límite alcanzado: contacte a su proveedor para ampliar."
            : ` Quedan ${seats.remaining}.`}
        </p>
      </Card>

      {error ? (
        <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      ) : null}
      {okMsg ? (
        <p className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">{okMsg}</p>
      ) : null}
      {createdCreds ? (
        <Card className="border-gold/40 bg-gold/10">
          <p className="text-sm font-semibold">{createdCreds.label}</p>
          <p className="mt-2 text-sm">
            Correo: <span className="font-mono font-semibold">{createdCreds.email}</span>
          </p>
          <p className="text-sm">
            Contraseña:{" "}
            <span className="font-mono font-semibold">{createdCreds.password}</span>
          </p>
          <p className="mt-2 text-xs text-muted">Cópiela ahora; no se guarda en texto plano.</p>
        </Card>
      ) : null}

      <Card>
        <p className="mb-3 text-sm font-semibold">Nuevo usuario</p>
        <form onSubmit={createUser} className="space-y-3">
          <div>
            <Label htmlFor="u-name">Nombre</Label>
            <Input
              id="u-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={atLimit || pending}
            />
          </div>
          <div>
            <Label htmlFor="u-email">Correo</Label>
            <Input
              id="u-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={atLimit || pending}
            />
          </div>
          <div>
            <Label htmlFor="u-role">Perfil</Label>
            <select
              id="u-role"
              value={role}
              onChange={(e) => setRole(e.target.value as "SELLER" | "ADMIN")}
              className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
              disabled={atLimit || pending}
            >
              <option value="SELLER">Vendedor</option>
              <option value="ADMIN">Administrador (sin Configuración)</option>
            </select>
          </div>
          <div>
            <Label htmlFor="u-pass">Contraseña</Label>
            <div className="flex gap-2">
              <Input
                id="u-pass"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                disabled={atLimit || pending}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={atLimit || pending}
                onClick={() => setPassword(genPassword())}
              >
                Generar
              </Button>
            </div>
          </div>
          <Button type="submit" disabled={atLimit || pending} loading={pending} className="w-full">
            Crear usuario
          </Button>
        </form>
      </Card>

      <Card>
        <p className="mb-1 text-sm font-semibold">Acceso temporal de soporte</p>
        <p className="mb-3 text-xs text-muted">
          Para que el proveedor entre cuando necesite servicio. Rol dueño, no cuenta en el cupo.
          Solo uno activo a la vez.
        </p>
        <form onSubmit={createSupport} className="space-y-3">
          <div>
            <Label htmlFor="s-email">Correo</Label>
            <Input
              id="s-email"
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              placeholder="soporte@kngold.com.do"
              required
              disabled={pending}
            />
          </div>
          <div>
            <Label htmlFor="s-pass">Contraseña</Label>
            <div className="flex gap-2">
              <Input
                id="s-pass"
                type="text"
                value={supportPassword}
                onChange={(e) => setSupportPassword(e.target.value)}
                required
                minLength={6}
                disabled={pending}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => setSupportPassword(genPassword())}
              >
                Generar
              </Button>
            </div>
          </div>
          <div>
            <Label htmlFor="s-hours">Vigencia</Label>
            <select
              id="s-hours"
              value={supportHours}
              onChange={(e) => setSupportHours(Number(e.target.value))}
              className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
              disabled={pending}
            >
              <option value={24}>24 horas</option>
              <option value={48}>48 horas</option>
              <option value={72}>72 horas</option>
            </select>
          </div>
          <Button type="submit" variant="gold" disabled={pending} loading={pending} className="w-full">
            Crear acceso temporal
          </Button>
        </form>
      </Card>

      <div>
        <p className="mb-2 text-sm font-semibold">Usuarios</p>
        {users.length === 0 ? (
          <EmptyState title="Sin usuarios" />
        ) : (
          <div className="space-y-2">
            {users.map((u) => {
              const isMe = u.id === currentUserId;
              return (
                <Card key={u.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{u.name}</p>
                        {u.isSupport ? (
                          <Badge tone="warn">Soporte</Badge>
                        ) : u.role === "OWNER" ? (
                          <Badge tone="gold">Administración</Badge>
                        ) : u.role === "ADMIN" ? (
                          <Badge tone="gold">Administrador</Badge>
                        ) : (
                          <Badge>Vendedor</Badge>
                        )}
                        {!u.active || u.expired ? (
                          <Badge tone="danger">{u.expired ? "Vencido" : "Inactivo"}</Badge>
                        ) : (
                          <Badge tone="success">Activo</Badge>
                        )}
                      </div>
                      <p className="truncate text-sm text-muted">{u.email}</p>
                      {u.expiresAt ? (
                        <p className="mt-1 text-xs text-muted">
                          Vence{" "}
                          {format(parseISO(u.expiresAt), "dd MMM yyyy · HH:mm", {
                            locale: es,
                          })}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col gap-1.5">
                      {u.isSupport && u.active && !u.expired ? (
                        <Button
                          type="button"
                          variant="danger"
                          className="min-h-9 px-3 py-1.5 text-xs"
                          onClick={() => revokeSupport(u)}
                          disabled={pending}
                        >
                          Revocar
                        </Button>
                      ) : null}
                      {!u.isSupport || !u.active ? (
                        <Button
                          type="button"
                          variant={u.active && !u.expired ? "secondary" : "primary"}
                          className="min-h-9 px-3 py-1.5 text-xs"
                          disabled={pending || isMe || (u.expired && u.isSupport)}
                          onClick={() =>
                            toggleActive(u, !(u.active && !u.expired))
                          }
                        >
                          {u.active && !u.expired ? "Desactivar" : "Reactivar"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
