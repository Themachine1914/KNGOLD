import { z } from "zod";

/**
 * Esquemas de entrada de la API.
 *
 * Las rutas coercían los tipos a mano (`Number(l.qty)`), lo que dejaba pasar
 * cantidades fraccionarias y `NaN`: una cotización podía guardar `qty = 2`
 * y cobrar `2.9 × precio`. Todo lo que entra por HTTP pasa por aquí.
 */

/** Texto opcional: "" y espacios en blanco cuentan como ausente. */
const optionalText = (max: number) =>
  z
    .string()
    // El trim va ANTES del max: si no, un RNC de 50 caracteres rodeado de
    // espacios se rechazaba por "demasiado largo", y con el mensaje de zod
    // en inglés.
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .optional()
    .transform((v) => (v ? v : undefined));

const qty = z
  .number({ error: "Falta la cantidad, o no es un número." })
  .int("La cantidad debe ser un número entero.")
  .positive("La cantidad debe ser mayor que cero.")
  .max(100_000, "Cantidad demasiado grande.");

const lineSchema = z.object({
  productId: z.string({ error: "Falta el producto." }).min(1, "Falta el producto."),
  qty,
});

export const quoteInputSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(1, "El cliente es obligatorio.").max(200),
    rnc: optionalText(50),
    phone: optionalText(50),
    address: optionalText(300),
    email: optionalText(200),
    existingId: optionalText(100),
  }),
  includeItbis: z.boolean().default(false),
  notes: optionalText(500),
  lines: z.array(lineSchema).min(1, "Agrega al menos un producto."),
});

export const importInputSchema = z.object({
  supplier: optionalText(200),
  /** El formulario manda YYYY-MM-DD; la hora la fija la ruta. */
  eta: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.")
    // El regex acepta "2026-02-31", y `new Date` lo convierte en el 3 de
    // marzo en vez de fallar: la ETA se guardaba en otro día sin avisar.
    .refine(
      (v) => new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v,
      "Esa fecha no existe."
    ),
  notes: optionalText(500),
  status: z.enum(["ORDERED", "IN_TRANSIT"]).default("ORDERED"),
  lines: z.array(lineSchema).min(1, "Agrega al menos un producto."),
});

export const adjustInputSchema = z.object({
  productId: z.string().min(1),
  qtyDelta: z
    .number({ error: "Falta la cantidad del ajuste, o no es un número." })
    .int("El ajuste debe ser un número entero.")
    .refine((n) => n !== 0, "El ajuste no puede ser cero.")
    .refine((n) => Math.abs(n) <= 100_000, "Ajuste demasiado grande."),
  note: optionalText(500),
});

/** Primer mensaje de error legible, para devolverlo al cliente. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Datos inválidos.";
}
