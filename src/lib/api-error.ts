/**
 * Traduce cualquier error a algo que se le pueda enseñar al usuario.
 *
 * Los `throw new Error(...)` del dominio están escritos para leerse ("Stock
 * insuficiente para KN-60X: disponible 3, solicitado 5") y se devuelven tal
 * cual. Los del SDK de Firestore no: traen códigos gRPC, nombres de colección
 * y a veces detalles de la credencial de servicio. Esos se registran en el
 * servidor y al cliente le llega un mensaje genérico.
 */

/** ¿Viene del SDK de Firebase/Google en lugar de nuestro dominio? */
function isInfrastructureError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const name = (e as { name?: unknown }).name;
  if (typeof name === "string" && /^(FirebaseError|GoogleError|FirebaseAppError)$/.test(name)) {
    return true;
  }
  // Los errores gRPC de Firestore traen un `code` numérico.
  return typeof (e as { code?: unknown }).code === "number";
}

export function publicErrorMessage(e: unknown): { message: string; status: number } {
  if (isInfrastructureError(e)) {
    console.error("[api] error de base de datos:", e);
    return { message: "Error del servidor. Intenta de nuevo.", status: 500 };
  }

  if (e instanceof Error) {
    // "Producto no encontrado", "Cotización no encontrada", "Pedido no encontrado"
    if (/no encontrad[ao]/i.test(e.message)) {
      return { message: e.message, status: 404 };
    }
    // Choques de concurrencia: el documento cambió bajo nuestros pies.
    if (/cambió de estado|recarga la página/i.test(e.message)) {
      return { message: e.message, status: 409 };
    }
    return { message: e.message, status: 400 };
  }

  console.error("[api] error desconocido:", e);
  return { message: "Error del servidor. Intenta de nuevo.", status: 500 };
}
