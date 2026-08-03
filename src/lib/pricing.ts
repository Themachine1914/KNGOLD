export const ITBIS_RATE = 0.18;

export function calcQuoteTotals(
  lineTotals: number[],
  includeItbis: boolean
): { subtotal: number; itbisAmount: number; total: number } {
  const subtotal = round2(lineTotals.reduce((a, b) => a + b, 0));
  const itbisAmount = includeItbis ? round2(subtotal * ITBIS_RATE) : 0;
  const total = round2(subtotal + itbisAmount);
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
