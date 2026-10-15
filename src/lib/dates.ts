import { format, formatDistanceToNow, isValid, parseISO } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Formateo de fechas tolerante a documentos incompletos.
 *
 * En Firestore no hay esquema: un documento escrito a mano o por un seed
 * viejo puede no traer `createdAt`. `parseISO(undefined)` lanza TypeError y
 * `format()` sobre una fecha inválida lanza RangeError, así que un solo
 * documento malo mandaba la pantalla entera a error.tsx.
 */
export function fmtDate(iso: string | null | undefined, pattern: string): string {
  if (!iso) return "—";
  const d = parseISO(iso);
  if (!isValid(d)) return "—";
  // Las horas se muestran en hora de RD: en Vercel el servidor corre en UTC.
  // Solo si el patrón lleva hora; una fecha sola ("2026-10-20") se correría de día.
  return format(/[Hh]/.test(pattern) ? toDoWallTime(d) : d, pattern, { locale: es });
}

const DO_TZ = "America/Santo_Domingo";

/** La misma hora de reloj que en Santo Domingo, sin importar la zona del servidor. */
function toDoWallTime(d: Date): Date {
  return new Date(d.toLocaleString("en-US", { timeZone: DO_TZ }));
}

/** "hace 5 minutos", "en 2 días". Devuelve "—" si la fecha no sirve. */
export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parseISO(iso);
  return isValid(d) ? formatDistanceToNow(d, { addSuffix: true, locale: es }) : "—";
}

/** La fecha si es válida, o `null`. Para cálculos, no para mostrar. */
export function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = parseISO(iso);
  return isValid(d) ? d : null;
}

/**
 * ¿Ya pasó esta fecha? Devuelve false si falta o es inválida.
 *
 * Vive aquí y no en la página porque `react-hooks/purity` marca `Date.now()`
 * llamado directamente en el cuerpo de un componente.
 */
export function isExpired(iso: string | null | undefined): boolean {
  const d = toDate(iso);
  return !!d && d.getTime() <= Date.now();
}
