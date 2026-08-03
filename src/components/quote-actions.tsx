"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui";

export function QuoteActions({
  quoteId,
  status,
}: {
  quoteId: string;
  status: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<"confirm" | "cancel" | null>(null);
  const [error, setError] = useState("");

  if (status !== "RESERVED") return null;

  async function act(action: "confirm" | "cancel") {
    setLoading(action);
    setError("");
    const res = await fetch(`/api/quotes/${quoteId}/${action}`, { method: "POST" });
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
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          disabled={!!loading}
          onClick={() => act("confirm")}
        >
          {loading === "confirm" ? "..." : "Confirmar venta"}
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={!!loading}
          onClick={() => act("cancel")}
        >
          {loading === "cancel" ? "..." : "Cancelar"}
        </Button>
      </div>
    </div>
  );
}
