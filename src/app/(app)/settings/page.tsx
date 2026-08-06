import { redirect } from "next/navigation";
import Link from "next/link";
import { formatISO, subDays } from "date-fns";
import { auth } from "@/lib/auth";
import { listAppUsers, listUserActivity } from "@/lib/audit";
import { getSeatInfo, listManagedUsers } from "@/lib/users";
import { UserActivityPanel } from "@/components/user-activity-panel";
import { UsersAdminPanel } from "@/components/users-admin-panel";
import { PageHeader } from "@/components/ui";

function ymd(d: Date) {
  return formatISO(d, { representation: "date" });
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    userId?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const session = await auth();
  if (session!.user.role !== "OWNER") redirect("/dashboard");

  const sp = await searchParams;
  const tab = sp.tab === "activity" ? "activity" : "users";
  const from = sp.from || ymd(subDays(new Date(), 30));
  const to = sp.to || ymd(new Date());
  const userId = sp.userId || "";

  const [managedUsers, seats, filterUsers, rows] = await Promise.all([
    listManagedUsers(),
    getSeatInfo(),
    listAppUsers(),
    tab === "activity"
      ? listUserActivity({
          userId: userId || undefined,
          from,
          to,
          limit: 500,
        })
      : Promise.resolve([]),
  ]);

  return (
    <div>
      <PageHeader
        title="Configuración"
        subtitle="Usuarios del plan, acceso de soporte y bitácora de actividad."
      />

      <div className="mb-4 grid grid-cols-2 gap-2">
        <Link
          href="/settings"
          className={`rounded-xl px-3 py-2.5 text-center text-sm font-semibold ${
            tab === "users" ? "bg-ink text-white" : "border border-border bg-white text-ink"
          }`}
        >
          Usuarios
        </Link>
        <Link
          href="/settings?tab=activity"
          className={`rounded-xl px-3 py-2.5 text-center text-sm font-semibold ${
            tab === "activity" ? "bg-ink text-white" : "border border-border bg-white text-ink"
          }`}
        >
          Actividad
        </Link>
      </div>

      {tab === "users" ? (
        <UsersAdminPanel
          initialUsers={managedUsers}
          initialSeats={seats}
          currentUserId={session!.user.id}
        />
      ) : (
        <UserActivityPanel
          users={filterUsers}
          rows={rows}
          filters={{ userId, from, to }}
        />
      )}
    </div>
  );
}
