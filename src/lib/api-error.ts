import { Prisma } from "@prisma/client";

/**
 * Traduce cualquier error a algo que se le pueda enseñar al usuario.
 *
 * Los `throw new Error(...)` del dominio están escritos para leerse ("Stock
 * insuficiente para KN-60X…") y se devuelven tal cual. Los errores de Prisma
 * no: traen la consulta, rutas del servidor y nombres de columnas, así que
 * se registran y al cliente le llega un mensaje genérico.
 */
export function publicErrorMessage(e: unknown): { message: string; status: number } {
  if (
    e instanceof Prisma.PrismaClientKnownRequestError ||
    e instanceof Prisma.PrismaClientValidationError ||
    e instanceof Prisma.PrismaClientInitializationError ||
    e instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    console.error("[api] error de base de datos:", e);

    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      // Registro no encontrado (findUniqueOrThrow, update sobre id inexistente).
      if (e.code === "P2025") {
        return { message: "No encontramos ese registro.", status: 404 };
      }
      // Choque contra un índice único: número de cotización o de pedido.
      if (e.code === "P2002") {
        return {
          message: "Ese dato ya existe. Recarga la página e intenta de nuevo.",
          status: 409,
        };
      }
      // Llave foránea: producto o cliente que no existe.
      if (e.code === "P2003") {
        return { message: "Alguno de los datos enviados no existe.", status: 400 };
      }
    }
    return { message: "Error del servidor. Intenta de nuevo.", status: 500 };
  }

  if (e instanceof Error) {
    return { message: e.message, status: 400 };
  }

  console.error("[api] error desconocido:", e);
  return { message: "Error del servidor. Intenta de nuevo.", status: 500 };
}
