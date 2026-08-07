"use client";

import { Button, Card } from "@/components/ui";

export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <Card className="space-y-3 text-center">
      <p className="text-lg font-semibold text-ink">No se pudo cargar</p>
      <p className="text-sm text-muted">
        Puede ser la conexión o el límite diario de la base de datos. Espera unos
        minutos (o hasta mañana) e intenta de nuevo; si sigue fallando, avísale
        al dueño.
      </p>
      {error.digest ? (
        <p className="text-xs text-muted">Referencia: {error.digest}</p>
      ) : null}
      <Button type="button" variant="gold" onClick={() => unstable_retry()}>
        Reintentar
      </Button>
    </Card>
  );
}
