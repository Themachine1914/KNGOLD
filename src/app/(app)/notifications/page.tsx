import { PageHeader } from "@/components/ui";
import { NotificationsList } from "@/components/notifications-list";

export default function NotificationsPage() {
  return (
    <div>
      <PageHeader
        title="Notificaciones"
        subtitle="Avisos internos de pedidos y facturación"
      />
      <NotificationsList />
    </div>
  );
}
