export const ITBIS_RATE = 0.18;

/**
 * El total siempre es la suma de líneas (mismo precio con o sin comprobante).
 * Con comprobante se calcula el ITBIS 18% incluido solo para mostrarlo.
 */
export function calcQuoteTotals(
  lineTotals: number[],
  includeItbis: boolean
): { subtotal: number; itbisAmount: number; total: number } {
  const total = round2(lineTotals.reduce((a, b) => a + b, 0));
  if (!includeItbis) {
    return { subtotal: total, itbisAmount: 0, total };
  }
  const itbisAmount = round2((total * ITBIS_RATE) / (1 + ITBIS_RATE));
  const subtotal = round2(total - itbisAmount);
  return { subtotal, itbisAmount, total };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatRD(amount: number): string {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
    minimumFractionDigits: 2,
  }).format(amount);
}
