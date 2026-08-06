"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";

export function BackupPanel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function downloadBackup() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/backup", { method: "GET" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "No se pudo descargar el respaldo");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] || `kngold-respaldo.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al descargar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-semibold text-ink">Respaldo de data</h2>
        <p className="mt-1 text-sm text-muted">
          Descarga un ZIP con CSV de todo lo generado hasta ahora: productos,
          clientes, pedidos y líneas, movimientos, importaciones y usuarios.
        </p>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-muted">
          <li>productos.csv</li>
          <li>clientes.csv</li>
          <li>pedidos.csv + pedido_lineas.csv</li>
          <li>movimientos.csv</li>
          <li>importaciones.csv + importacion_lineas.csv</li>
          <li>usuarios.csv (sin contraseñas)</li>
        </ul>
        <div className="mt-4">
          <Button
            type="button"
            variant="gold"
            loading={loading}
            onClick={downloadBackup}
            className="w-full"
          >
            Descargar respaldo CSV
          </Button>
        </div>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      </Card>

      <p className="text-xs text-muted">
        La pestaña Actividad sigue sirviendo para filtrar y exportar solo la
        bitácora de un rango. Este respaldo es la copia completa del negocio.
      </p>
    </div>
  );
}
