"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui";

export function ImportActions({
  importId,
  status,
}: {
  importId: string;
  status: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (status === "ARRIVED" || status === "CANCELLED") return null;

  async function act(action: "transit" | "arrive" | "cancel") {
    setLoading(action);
    setError("");
    const res = await fetch(`/api/imports/${importId}/${action}`, {
      method: "POST",
    });
    const data = await res.json();
    setLoading(null);
    if (!res.ok) {
      setError(data.error || "Error");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="grid grid-cols-1 gap-2">
        {status === "ORDERED" ? (
          <Button
            type="button"
            variant="secondary"
            disabled={!!loading}
            onClick={() => act("transit")}
          >
            {loading === "transit" ? "..." : "Marcar en tránsito"}
          </Button>
        ) : null}
        <Button type="button" disabled={!!loading} onClick={() => act("arrive")}>
          {loading === "arrive" ? "..." : "Confirmar llegada (entrar a stock)"}
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={!!loading}
          onClick={() => act("cancel")}
        >
          {loading === "cancel" ? "..." : "Cancelar pedido"}
        </Button>
      </div>
    </div>
  );
}
