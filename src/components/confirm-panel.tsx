"use client";

import { type ReactNode } from "react";
import { Button, Card } from "./ui";

/**
 * Panel de confirmación para acciones que no se pueden deshacer.
 * Muestra la consecuencia en números antes de que el usuario toque,
 * y nunca pone la acción destructiva al mismo peso que la principal.
 */
export function ConfirmPanel({
  title,
  detail,
  confirmLabel,
  loadingLabel,
  tone = "gold",
  loading,
  error,
  onConfirm,
  onDismiss,
}: {
  title: string;
  detail: ReactNode;
  confirmLabel: string;
  loadingLabel: string;
  tone?: "gold" | "danger";
  loading: boolean;
  error?: string;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <Card className="space-y-3 border-ink/15">
      <div>
        <p className="font-semibold text-ink">{title}</p>
        <div className="mt-1 text-sm text-muted">{detail}</div>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="space-y-2">
        <Button
          type="button"
          variant={tone}
          className="w-full"
          loading={loading}
          onClick={onConfirm}
        >
          {loading ? loadingLabel : confirmLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={loading}
          onClick={onDismiss}
        >
          No, volver
        </Button>
      </div>
    </Card>
  );
}
