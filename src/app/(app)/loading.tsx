export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="h-8 w-2/3 rounded-lg bg-border/70" />
      <div className="h-4 w-1/2 rounded bg-border/50" />
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 rounded-2xl border border-border bg-card" />
        ))}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-24 rounded-2xl border border-border bg-card" />
      ))}
    </div>
  );
}
