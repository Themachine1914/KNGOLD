import { redirect } from "next/navigation";
import Link from "next/link";
import { formatISO, subDays } from "date-fns";
import { auth } from "@/lib/auth";
import { listAppUsers, listUserActivity } from "@/lib/audit";
import { getSeatInfo, listManagedUsers } from "@/lib/users";
import { BackupPanel } from "@/components/backup-panel";
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
  const tab =
    sp.tab === "activity" ? "activity" : sp.tab === "backup" ? "backup" : "users";
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

  const tabs = [
    { id: "users", href: "/settings", label: "Usuarios" },
    { id: "activity", href: "/settings?tab=activity", label: "Actividad" },
    { id: "backup", href: "/settings?tab=backup", label: "Respaldo" },
  ] as const;

  return (
    <div>
      <PageHeader
        title="Configuración"
        subtitle="Usuarios del plan, actividad y respaldo de data."
      />

      <div className="mb-4 grid grid-cols-3 gap-2">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={t.href}
            className={`rounded-xl px-3 py-2.5 text-center text-sm font-semibold ${
              tab === t.id ? "bg-ink text-white" : "border border-border bg-white text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "users" ? (
        <UsersAdminPanel
          initialUsers={managedUsers}
          initialSeats={seats}
          currentUserId={session!.user.id}
        />
      ) : null}

      {tab === "activity" ? (
        <UserActivityPanel
          users={filterUsers}
          rows={rows}
          filters={{ userId, from, to }}
        />
      ) : null}

      {tab === "backup" ? <BackupPanel /> : null}
    </div>
  );
}
