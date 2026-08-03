/** Se lanza cuando la sesión venció y ya se está redirigiendo al login. */
export class SessionExpiredError extends Error {
  constructor() {
    super("Sesión vencida");
    this.name = "SessionExpiredError";
  }
}

/**
 * POST a la API desde el cliente.
 *
 * Centraliza dos cosas que cada componente resolvía por su cuenta (o no
 * resolvía): distinguir una sesión vencida de una caída de red, y no tratar
 * como JSON una respuesta que no lo es. Con la sesión vencida el vendedor
 * veía "Sin conexión" y reintentaba para siempre.
 */
export async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });

  if (res.status === 401 || res.redirected) {
    window.location.href = "/login";
    throw new SessionExpiredError();
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : "No se pudo completar la acción";
    throw new Error(message);
  }
  return data as T;
}

/** Mensaje para el usuario a partir de lo que sea que se lanzó. */
export function errorMessage(e: unknown): string {
  if (e instanceof SessionExpiredError) return "";
  if (e instanceof Error && e.name !== "TypeError") return e.message;
  return "Sin conexión. Revisa el internet e intenta de nuevo.";
}
