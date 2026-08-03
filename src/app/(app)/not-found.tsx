import Link from "next/link";
import { Button, EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <EmptyState
      title="No encontramos eso"
      body="El documento no existe o no es tuyo."
      action={
        <Link href="/dashboard">
          <Button variant="secondary">Volver al inicio</Button>
        </Link>
      }
    />
  );
}
