"use client";

/**
 * Selector de cantidad: −, campo escribible y +.
 * Objetivos táctiles de 44 px y teclado numérico en móvil, para no
 * obligar al vendedor a dar 24 toques cuando cotiza 24 unidades.
 */
export function QtyStepper({
  value,
  onChange,
  max,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  max?: number;
  label: string;
}) {
  const atMax = max !== undefined && value >= max;

  function clamp(n: number) {
    const floor = Math.max(0, Math.floor(n));
    // `max` puede llegar negativo: disponible = físico − reservado, y un
    // sobre-reservado lo deja bajo cero. Sin este Math.max, el campo
    // mostraría una cantidad negativa.
    return max !== undefined ? Math.min(Math.max(0, max), floor) : floor;
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label={`Quitar una unidad de ${label}`}
        className="h-11 w-11 rounded-xl border border-border bg-white text-xl font-semibold disabled:opacity-40"
        disabled={value <= 0}
        onClick={() => onChange(clamp(value - 1))}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={`Cantidad de ${label}`}
        value={value || ""}
        placeholder="0"
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          onChange(digits ? clamp(Number(digits)) : 0);
        }}
        className="h-11 w-14 rounded-xl border border-border bg-white text-center text-lg font-semibold tabular-nums outline-none ring-gold/30 focus:ring-2"
      />
      <button
        type="button"
        aria-label={`Agregar una unidad de ${label}`}
        className="h-11 w-11 rounded-xl border border-border bg-white text-xl font-semibold disabled:opacity-40"
        disabled={atMax}
        onClick={() => onChange(clamp(value + 1))}
      >
        +
      </button>
    </div>
  );
}
