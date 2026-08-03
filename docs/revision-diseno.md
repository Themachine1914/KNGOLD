# Revisión de diseño y usabilidad — KN GOLD

Revisión de solo lectura, con una restricción: **no se cambia la línea gráfica**.
Paleta (`src/app/globals.css:3-15`), tipografías (`src/app/layout.tsx:5-15`) y radios
generosos se mantienen tal cual. Todo lo que sigue es usarlos mejor, no cambiarlos.

Objetivo: que un vendedor con poca práctica cotice rápido y sin equivocarse, y que el
dueño entienda su inventario de un vistazo.

---

## 1. Los cinco puntos de mayor fricción

### 1.1 El vendedor no ve el total mientras arma la cotización

`src/components/new-quote-form.tsx:144-216`

El paso 2 (elegir productos) no muestra subtotal ni cantidad de ítems; el total solo
aparece en el paso 3 (`:263-266`). Frente al cliente la pregunta es "¿cuánto me sale?" y
hay que avanzar de paso para responderla. Lo irónico es que `calcQuoteTotals` **ya se
calcula** en `:45-48` y se desperdicia en ese paso.

**Solución:** barra fija sobre la nav en el paso 2 —
`fixed inset-x-0 bottom-[64px] mx-auto max-w-lg border-t border-border bg-card px-4 py-3`,
con el total en `text-2xl font-semibold tabular-nums text-ink` y el botón de avanzar en
`bg-gold text-ink`.

### 1.2 Ninguna acción irreversible pide confirmación

`src/components/quote-actions.tsx:37-51`, `src/components/import-actions.tsx:49-59`

"Confirmar venta" descuenta stock físico, "Cancelar" libera la reserva y "Confirmar
llegada" suma el pedido completo al inventario. Los tres son **un solo toque**, sin
confirmación ni resumen de la consecuencia. Peor: el botón destructivo está pegado al
principal con el mismo tamaño (`grid-cols-2 gap-2`).

**Solución:** hoja de confirmación en `Card` con la consecuencia en números ("Saldrán 12
uds de 4 productos · RD$…"), la acción principal en `bg-gold text-ink` y la destructiva
relegada a `variant="ghost" text-danger` — nunca lado a lado con igual peso.

### 1.3 Cantidades: solo +/−, botones de 36 px y cero teclado numérico

`src/components/new-quote-form.tsx:170-195`

Botones `h-9 w-9` (36×36, bajo el mínimo de 44) y sin campo escribible: cotizar 24
unidades cuesta **24 toques**. Y en toda la app no existe un solo `inputMode`:
`adjust-stock-form.tsx:61-67` y `new-import-form.tsx:172-184` usan `type="number"` sin
`inputMode="numeric"`, así que en el celular sale el teclado equivocado.

**Solución:** `h-11 w-11 rounded-xl` en los +/−, input central
`w-16 h-11 text-center text-lg font-semibold tabular-nums` con `inputMode="numeric"`, y
`inputMode="decimal"` en montos.

### 1.4 "Ajustar stock" es ambiguo y puede destruir el inventario

`src/components/adjust-stock-form.tsx:60-67`

El campo se llama "Cantidad (+/−)" y el único aviso de que es un **delta** y no un valor
absoluto es el placeholder "Ej: 5 o -2". El dueño que quiere "dejar 50" escribe `50` y
suma 50. No hay vista previa ni forma de deshacer.

**Solución:** dos botones `Entró` / `Salió` (`bg-ink text-white` en el activo) más una
cantidad positiva, y una línea de previsualización obligatoria: `Físico 38 → 43` en
`text-lg font-semibold tabular-nums text-ink`.

### 1.5 El dato que gobierna la venta —el disponible— es el texto más débil

`src/components/new-quote-form.tsx:164-166`

`{formatRD(p.netPrice)} · Disp. {p.available}` va en `text-sm text-muted`, mezclado con el
precio. El botón `+` se deshabilita en silencio al llegar al tope (`:185-186`) sin decir
por qué. El vendedor nunca ve el físico ni sabe que disponible = físico − reservado (el
dueño sí lo ve, en `inventory/page.tsx:119-132`).

**Solución:** sacar el disponible a un `Badge` con el mismo criterio de color que
inventario (`danger` / `warn` / `success`), número en `text-lg font-semibold tabular-nums`,
y al topar mostrar `Máximo disponible: 8` en `text-xs text-warn`.

---

## 2. Hallazgos por pantalla

### Sistema base (`src/components/ui.tsx`)

- `:47` — `neutral: "bg-border/60 text-ink"` es casi invisible sobre `bg-card`, y es
  justamente el tono de `DRAFT` y `ORDERED` (`labels.ts:19,63`): los dos estados "recién
  creado" no se distinguen del fondo. Reforzar a `bg-ink/8 text-ink ring-1 ring-border`.
- `:55` — badges en `text-xs px-2 py-0.5`: demasiado pequeños para leer a distancia de
  brazo bajo el sol. Subir a `text-[13px] px-2.5 py-1`.
- `:70-75` — ninguna variante de `Button` usa dorado; falta `variant="gold"`.
- `:78` — `py-2.5` da ~40 px de alto, bajo el mínimo táctil de 44.
- El `Button` no tiene estado de carga propio, así que cada componente reinventa el `"..."`
  (`quote-actions.tsx:42,50`).
- **No existe `tabular-nums` en ningún archivo del proyecto.**

### Navegación (`src/components/nav.tsx`)

- `:51` — items de `text-[10px]` con `py-2`: alto efectivo ~34 px, y son 5 en `grid-cols-5`
  sobre pantallas de 360 px.
- `:10-12` — "Movim." y "Cotiz." son abreviaturas truncadas; sin iconos, el texto es la
  única pista.
- `:19-20` — el vendedor tiene "Cotiz." y "Nueva" contiguos y visualmente idénticos, con
  destinos muy distintos: riesgo alto de toque errado. "Nueva" debería ser un botón dorado
  destacado, no un tab más.
- `:81-82` — `text-white/55` sobre `#151311` queda por debajo de AA.

### Dashboard (`src/app/(app)/dashboard/page.tsx`)

- `:65-86` — las tres tarjetas KPI usan `text-2xl`: mismo peso para "Productos"
  (informativo) que para "Stock bajo" (accionable), y ninguna es clicable hacia su listado.
- `:130-131`, `:194-195` (y `quotes/page.tsx:41-44`, `imports/page.tsx:42-53`) — `Card` con
  `mb-2` dentro de un `<Link>` inline, a su vez dentro de un contenedor `space-y-2`. El
  margen vertical no aplica a elementos inline: el `space-y-2` no hace nada y el `mb-2` es
  el parche. Falta `className="block"` en el `Link`.
- `:247` — el número residual en `text-xl font-bold` es lo más pesado de la fila, pero no
  dice de qué es (físico o disponible); el rótulo está en `:239` en `text-sm text-muted`.
- `:255-257` — para el vendedor, "Cotizaciones reservadas activas" es su métrica más
  importante y queda como texto suelto `text-xs` al final.

### Inventario (`src/app/(app)/inventory/page.tsx`)

- `:49-54` — reimplementa `Input` a mano con las mismas clases en vez de usar el
  componente; el botón "Buscar" (`:56-59`) no tiene `py` y depende del stretch.
- `:95` — `text-gold-dark` (#9a7a2f) sobre blanco da ≈4.1:1, insuficiente para texto
  pequeño. Mismo problema en los "Ver todos" del dashboard (`:117,188,219`).
- `:102` — el precio (`text-sm font-semibold`) pesa lo mismo que la descripción.
- `:119-132` — la trinidad Físico / Reservado / Disponible está en `text-xs`, siendo el
  bloque más informativo para el dueño.
- `:135` — `AdjustStockForm` se inserta sin separación ni contenedor; su botón "Ajustar"
  (`adjust-stock-form.tsx:46-53`, `py-1.5 text-xs`) mide ~28 px de alto.

### Cotizaciones

- `quotes/page.tsx` — sin filtro por estado: el vendedor no puede aislar las "Reservadas",
  que son las únicas que exigen acción. El monto (`:51`) va incrustado en una línea
  `text-sm text-muted` junto al conteo de ítems.
- `quotes/[id]/page.tsx:66-71` — la reserva vence a 48 h, pero solo se muestra como fecha
  en `text-sm` dentro de una lista de metadatos. Debería ser lo primero de la pantalla:
  `Badge tone="warn"` con "Vence en 14 h".
- `:104-107` — el Total en `text-base font-semibold`, **menor** que el `text-2xl` del
  título de la página. Debería ser `text-3xl font-semibold tabular-nums text-ink`.
- `:113-117` — "Descargar / compartir PDF" es la acción real de cierre (mandarlo por
  WhatsApp) y está en `variant="secondary"`, por debajo de las destructivas.
- `:44` — el estado va en el slot `action` del `PageHeader` como badge diminuto.

### Movimientos (`src/app/(app)/movements/page.tsx`)

- `:84-86` — ternario muerto: ambas ramas devuelven `text-ink`.
- `:78-96` — tres números en la misma columna (delta, restante, físico) con rótulos
  abreviados "Disp." / "Quedan" en `text-[11px]` y `text-[10px]`: denso y difícil de
  escanear.
- Sin filtro por producto ni por tipo sobre 120 registros (`:19`).

### Importaciones

- `imports/[id]/page.tsx:88` — muestra "Stock actual" pero no el resultado tras confirmar
  la llegada: el usuario no ve la consecuencia antes de tocar.
- `import-actions.tsx:49` — "Confirmar llegada (entrar a stock)": el paréntesis explicativo
  dentro del botón delata que la etiqueta no se sostiene sola. Además aparece en estado
  `ORDERED`, permitiendo saltarse "en tránsito" sin advertencia.
- `new-import-form.tsx:144` — lista con `max-h-[45vh] overflow-y-auto` anidada dentro del
  scroll de página: scroll atrapado, mal patrón en móvil. `:162,187` botones `h-8 w-8`
  (32 px). `:204-217` el resumen no es sticky.

### Login (`src/app/(auth)/login/page.tsx`)

- `:55,67` — credenciales de demo precargadas como `defaultValue` y repetidas en claro en
  `:76-78`.
- Sin enlace de recuperación ni botón de mostrar/ocultar clave.

### Estados

- **No existe ningún `loading.tsx` ni `error.tsx`** en `src/app`: cada navegación
  server-side deja la pantalla congelada sin feedback, y un fallo de red cae en la pantalla
  de error genérica de Next.
- Los estados de carga se expresan como `"..."` (`quote-actions.tsx:42,50`,
  `import-actions.tsx:46,50,58`), que no comunica nada.
- `EmptyState` (`ui.tsx:112-119`) nunca ofrece acción; en `quotes/page.tsx:36-39` debería
  incluir el botón "Nueva cotización".

### Vocabulario (`src/lib/labels.ts`)

Bien: "Reservada", "Llegó", "En tránsito", "Ajuste" son términos de negocio correctos.

- `:33` — "Liberación" es jerga de sistema; mejor "Reserva liberada".
- `:5` — "Borrador" no ocurre nunca en el flujo real.
- `:53` — "Pedido" como **estado** colisiona con "Pedido #123" del título
  (`imports/[id]:39`) y con la etiqueta "Pedidos" de la nav: tres significados para la
  misma palabra. Sugerido: estado "Encargado".
- `:42-45` — `movementTone` marca `CONFIRMACION_VENTA` en rojo (`danger`): una venta
  cerrada, el mejor evento del negocio, se ve como error. Debería ser `success` o `gold`;
  el signo `−` ya comunica la salida de stock.

---

## 3. Reglas de línea gráfica

Guía para implementar después, sobre la paleta y las fuentes actuales.

### Dorado vs tinta

- `bg-gold text-ink` (contraste ≈7.7:1, seguro): **una sola** acción principal por
  pantalla, siempre la que hace avanzar el dinero — "Reservar stock", "Confirmar venta",
  "Nueva cotización" en la nav del vendedor.
- `bg-ink text-white`: acciones secundarias y estados activos de tabs y filtros (como hoy).
- `text-gold-dark`: solo para texto de 16 px o más en semibold (SKU, tipo de producto,
  "Ver todos"). Por debajo de eso no cumple contraste — usar `text-muted` o `text-ink`.
- El dorado nunca en dos elementos que compitan dentro del mismo viewport.
- `bg-gold/20 text-gold-dark` (Badge gold): reservado exclusivamente para "algo está
  apartado o en camino" — `RESERVED` e `IN_TRANSIT`. Hoy ya es coherente; mantenerlo.

### Escala tipográfica

| Uso | Clase |
|---|---|
| Total de cotización, cifra héroe | `text-3xl font-semibold tabular-nums text-ink` |
| KPI, stock disponible, delta de movimiento | `text-2xl font-semibold tabular-nums` |
| Subtotal, ITBIS, precio unitario, línea | `text-base tabular-nums` |
| Título de pantalla | `text-2xl font-semibold tracking-tight` (actual) |
| Nombre de producto, fila de lista | `text-base font-semibold text-ink` |
| Metadatos, fechas, notas | `text-sm text-muted` |
| Rótulos y secciones | `text-xs font-semibold uppercase tracking-wide text-muted` (actual) |

Regla dura: **todo número que se compare en columna lleva `tabular-nums`** — dinero,
cantidades, stock. Hoy no existe en ningún archivo. Ningún dato de negocio por debajo de
`text-sm`; eliminar `text-[10px]` y `text-[11px]` salvo en elementos decorativos.

### Táctil

- Mínimo 44×44 en todo lo tocable: `Button` a `py-3` (≈46 px), +/− a `h-11 w-11`, tabs de
  nav a `py-2.5` con `text-[11px]`, `Badge` interactivo a `py-1`.
- Zona del pulgar: la acción principal de cada flujo va **fija abajo**, sobre la
  `BottomNav`, no al final del scroll.
- `inputMode="numeric"` en cantidades, `inputMode="decimal"` en montos, `inputMode="tel"`
  en teléfono (`new-quote-form.tsx:118-123`).

### Tonos de badge por estado

A unificar en `labels.ts`:

- `neutral` (reforzado a `bg-ink/8 ring-1 ring-border`): creado, aún sin efecto en
  inventario — `DRAFT`, `ORDERED`.
- `gold`: algo apartado o en camino — `RESERVED`, `IN_TRANSIT`, movimiento `RESERVA`.
- `success`: cerrado con buen resultado — `CONFIRMED`, `ARRIVED`, `ENTRADA`,
  `CONFIRMACION_VENTA`.
- `warn`: vencimiento o atención — `EXPIRED`, stock bajo, ETA atrasada.
- `danger`: cancelado o agotado — `CANCELLED`, disponible = 0.

### Estados obligatorios por pantalla

Vacío con acción, `loading.tsx` con skeleton de `Card`, `error.tsx` con botón de
reintentar, y todo texto de carga con un verbo real ("Reservando…", "Confirmando…") en
lugar de `"..."`.
