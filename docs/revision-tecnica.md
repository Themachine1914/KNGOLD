# Revisión técnica — KN GOLD

Revisión de solo lectura del proyecto (Next.js 16.2.12 + Prisma/SQLite y backend Go).
No incluye cambios de código: es un inventario de hallazgos para priorizar.

Verificaciones ejecutadas:

- `npx tsc --noEmit` → 0 errores
- `npm run lint` → 0 errores, 0 warnings
- `go build ./...` y `go vet ./...` → sin errores (Go 1.25)

Los linters y el compilador están limpios; todo lo que sigue es lógica, seguridad o
convenciones que las herramientas no detectan.

---

## 1. Bloqueantes antes de producción

### 1.1 Secreto JWT por defecto en el backend Go

`backend/internal/config/config.go:23`

```go
JWTSecret: env("JWT_SECRET", "kngold-dev-secret-change-in-production-2026")
```

Si la variable no está definida el servidor arranca igual. Cualquiera con acceso al
repositorio puede firmar un token con `role:"OWNER"` y controlar todo el inventario.

**Corrección:** abortar el arranque (`log.Fatal`) si `JWT_SECRET` está vacío o mide
menos de 32 bytes.

### 1.2 Credenciales del dueño precargadas en el formulario de login

`src/app/(auth)/login/page.tsx:55,66,77` — los campos traen
`defaultValue="dueno@kngold.com.do"` / `defaultValue="kngold2026"` y además se imprimen
en pantalla. Las mismas credenciales aparecen en `README.md:16-17`, en la portada HTML
pública del backend (`backend/cmd/server/main.go:96`), `prisma/seed.ts:142` y
`backend/internal/db/seed.go:26`.

En producción basta abrir `/login` y pulsar entrar.

**Corrección:** quitar los `defaultValue` y el bloque de demo, sembrar la contraseña
desde una variable de entorno y forzar el cambio en el primer ingreso.

### 1.3 IDOR: un vendedor opera cotizaciones ajenas (solo en Go)

`backend/internal/handlers/api.go:123-141` → `internal/inventory/service.go:237,311`

Solo se comprueba `RequireAuth`; nunca se compara `seller_id` con el usuario
autenticado. Con el ID de una cotización ajena, un SELLER puede confirmarla
(descontando stock) o cancelarla.

La ruta equivalente de Next.js **sí** valida propiedad
(`src/app/api/quotes/[id]/confirm/route.ts:21-26` y `cancel/route.ts:21-26`).

**Corrección:** leer `seller_id` y exigir `== userID` salvo que el rol sea OWNER.

### 1.4 Endpoint de cron sin protección

- `backend/cmd/server/main.go:58` registra `GET /api/cron/expire-quotes` **fuera** del
  grupo autenticado: endpoint público que escribe en base de datos.
- `src/app/api/cron/expire-quotes/route.ts:6-13`: si no existen `CRON_SECRET` **ni**
  `AUTH_SECRET` no se valida nada; fuera de producción queda abierto. Por defecto usa el
  secreto de firma de NextAuth como bearer, que así termina en configuraciones y logs de
  cron — si se filtra, permite forjar sesiones. La comparación usa `!==`, no es de tiempo
  constante.

**Corrección:** `CRON_SECRET` propio y obligatorio en ambos lados, comparado con
`timingSafeEqual` / `hmac.Equal`.

### 1.5 Cookie de sesión sin `Secure`

`backend/internal/auth/auth.go:101-110` — tiene `HttpOnly` y `SameSite=Lax`, pero el JWT
(vigencia de 30 días) viaja en claro sobre HTTP.

---

## 2. Bugs de lógica de negocio

### 2.1 Líneas duplicadas ⇒ disponible negativo y cotización imposible de confirmar

`src/lib/inventory.ts:112-123`

La validación recorre cada línea y compara `line.qty > available` contra el disponible
**total**, sin acumular lo ya reservado por las líneas anteriores de la misma cotización.
Tampoco existe unicidad `(quoteId, productId)`.

**Escenario:** producto con `stockOnHand = 5` y sin reservas. `POST /api/quotes` con
`lines: [{p,3},{p,3}]` — la API acepta JSON arbitrario, el formulario no es la única
entrada. Ambas líneas pasan (3 ≤ 5) y se reservan 6 de 5 unidades. El inventario muestra
**disponible = −1**. Al confirmar, el stock baja a 2 y la segunda línea lanza "Stock
físico insuficiente": la cotización queda en RESERVED de forma permanente, bloqueando
stock que nadie puede liberar.

**Corrección:** acumular por producto durante la validación y añadir
`@@unique([quoteId, productId])`.

### 2.2 Se puede confirmar una cotización vencida

`src/lib/inventory.ts:223`

`confirmQuote` solo valida `status === RESERVED`; nunca mira `reservedUntil`. El barrido
de expiración únicamente corre al abrir `/dashboard`, `/quotes` o `/movements`, o vía el
endpoint de cron.

**Escenario:** cotización creada el 01/08 a las 10:00 (`reservedUntil` = 03/08 10:00). El
05/08 el vendedor entra por enlace directo a `/quotes/<id>` — esa página **no** llama a
`expireReservedQuotes` — y pulsa "Confirmar venta". La venta se confirma dos días después
de vencida la reserva de 48 h.

### 2.3 La expiración pisa confirmaciones simultáneas y duplica movimientos

`src/lib/inventory.ts:318-352`

El `db.quote.findMany` ocurre **fuera** de `$transaction`, y dentro de la transacción
nunca se revalida que el estado siga siendo RESERVED.

**Escenario A:** el cron lee la cotización #10 (vencida); en ese instante el vendedor la
confirma (stock −3, CONFIRMED); acto seguido la transacción del cron escribe
`status = EXPIRED` y un movimiento LIBERACION_RESERVA. Queda una venta cobrada con stock
descontado, marcada como *Expirada*, y un historial que muestra la liberación de una
reserva que ya no existía.

**Escenario B:** dos pestañas abren `/dashboard` y `/quotes` a la vez ⇒ dos
LIBERACION_RESERVA por la misma línea, y el contador del historial queda inflado.

**Corrección:** mover la lectura dentro de la transacción y revalidar
`status === RESERVED` antes de escribir.

### 2.4 Cancelar una importación no es atómico

`src/lib/imports.ts:133-148` (y su equivalente Go, `backend/internal/imports/service.go:75-86`)

`cancelImportOrder` hace read-check-update sin `$transaction`, a diferencia de
`receiveImportOrder`, que sí es transaccional.

**Escenario:** doble toque en `/imports/<id>` sobre "Confirmar llegada" y "Cancelar
pedido". Si el cancel lee el estado ORDERED antes de que `arrive` termine, el pedido
queda CANCELLED pero el stock y el movimiento ENTRADA ya se aplicaron, y nada los
revierte.

### 2.5 Cantidades fraccionarias entran en columnas `Int`

`src/app/api/inventory/adjust/route.ts:19-24` y `src/app/api/quotes/route.ts:33-36`

Solo se valida `Number.isFinite` / `qty <= 0`; nunca `Number.isInteger`.

**Escenario:** `POST /api/inventory/adjust {qtyDelta: 2.5}` deja `stockOnHand` en **12.5**
partiendo de 10 — SQLite es de tipado dinámico y guarda el REAL en una columna INTEGER.
En cotizaciones, `qty: undefined` produce `NaN`, y tanto `NaN <= 0` como
`NaN > available` son `false`, así que ambas validaciones se saltan.

**Nota:** `zod` está declarado en `package.json:28` pero no se usa en ningún archivo de
`src/`. Las rutas coercen tipos a mano.

### 2.6 Disponible subestimado antes del barrido

`getReservedQty` (`src/lib/inventory.ts:17-27`) cuenta toda cotización RESERVED **sin
filtrar `reservedUntil > now`**, y `quotes/new/page.tsx` no llama a
`expireReservedQuotes`.

**Escenario:** la única cotización de un producto venció hace tres días y nadie abrió el
dashboard. El vendedor recibe "Stock insuficiente: disponible 0" con la mercancía libre
en almacén.

### 2.7 Numeración fuera de transacción

`src/lib/imports.ts:22-27` y `backend/internal/imports/service.go:36`: el
`MAX(number) + 1` se calcula antes de abrir la transacción, así que dos peticiones
concurrentes violan el `@unique` (error 400 opaco). En cotizaciones sí está dentro de la
transacción, pero en Go el error del `Scan` se descarta con `_ =`, lo que produciría un
número 1 silencioso.

### 2.8 Menores

- `ORDERED → ARRIVED` puede saltarse "en tránsito": `import-actions.tsx:49` muestra el
  botón siempre.
- Cancelar dos veces una importación no falla (solo se bloquea el estado ARRIVED).
- `getReservationHours` (`src/lib/inventory.ts:75`) trata `"0"` como falsy y cae al
  default de 48 h.
- El PDF nunca imprime el `status`: una cotización cancelada o expirada genera un PDF
  idéntico al de una vigente (`src/lib/pdf/quote-document.tsx`).
- Fechas formateadas con la zona horaria del servidor
  (`quote-document.tsx:149`, `quotes/[id]/page.tsx:69`): en Vercel (UTC) una reserva que
  vence a las 14:00 AST se imprime como "18:00". El cálculo con `addHours` sí es correcto;
  falla la presentación.

---

## 3. Modelo de datos

1. **Dinero en `Float`** (`prisma/schema.prisma:61-63,94-96,113-114`). `round2` mitiga los
   totales, pero `lineTotal = unitPrice * qty` se guarda **sin redondear**
   (`src/lib/inventory.ts:147`), así que la suma de líneas mostradas puede diferir un
   centavo del subtotal. Recomendado `Decimal` o enteros en centavos.
2. **Cero índices en todo el esquema.** Faltan al menos:
   `QuoteLine(productId, quoteId)`, `InventoryMovement(productId, createdAt, quoteId)`,
   `Quote(status, reservedUntil, sellerId)`, `ImportOrderLine(importId)`.
3. **Falta `@@unique([quoteId, productId])`** en `QuoteLine` — raíz del bug 2.1.
4. **`onDelete` incoherente:** `QuoteLine` cascadea al borrar una cotización, pero
   `InventoryMovement.quote` es `Restrict`, así que ninguna cotización con movimientos es
   borrable.
5. **`Product.type` y `Product.color` son `String` libres** (el seed usa "ESTUFA",
   "ABANICO", "SATINADA"): deberían ser enum o catálogo.
6. **`netPrice` es un campo suelto**, nunca derivado ni validado contra
   `listPrice * (1 − discountPct/100)`; el seed lo escribe a mano.
7. **Clientes duplicados:** el formulario nunca envía `existingId`, así que cada
   cotización crea un `Customer` nuevo. No hay `@unique` en `rnc` ni búsqueda de cliente
   existente.

---

## 4. Paridad TypeScript ↔ Go

| # | Tema | TypeScript | Go | Impacto |
|---|---|---|---|---|
| 1 | Autorización confirmar/cancelar | OWNER o vendedor dueño | Cualquier autenticado (`main.go:66-67`) | Crítico |
| 2 | Cron de expiración | Bearer `CRON_SECRET` en producción | Ruta pública (`main.go:58`) | Alto |
| 3 | `/api/movements` | Redirige si no es OWNER; `take: 120` | Solo auth; límite 100 y `?limit` sin tope | Alto |
| 4 | Cliente existente | Reutiliza `customer.existingId` | Siempre crea uno nuevo (`inventory/service.go:159`) | Alto |
| 5 | Endpoints ausentes | PDF + acceso a datos vía server components | Go solo expone `/api/products` y `/api/movements` | Alto |
| 6 | Nombre de cliente obligatorio | 400 si falta | Sin validación ni `trim` (`handlers/api.go:103-121`) | Medio |
| 7 | Horas de reserva | `app_settings.reservation_hours`, env como fallback | Solo env; la fila se siembra y nunca se lee | Medio |
| 8 | ETA de importación | `T12:00:00` hora local | 12:00 **UTC** (`handlers/api.go:165`) — 4 h de desfase en RD | Medio |
| 9 | 404 vs 400 | Cotización inexistente → 404 | 400 con `sql: no rows in result set` filtrado al cliente | Medio |
| 10 | Trim supplier/notes | `.trim() \|\| null` | `nullStr` sin trim → guarda espacios | Bajo |
| 11 | Movimiento RESERVA | `availableAfter` tras crear todas las líneas | Acumulativo línea a línea → difiere si un producto se repite | Bajo |
| 12 | Redondeo | `Number.EPSILON`, half-up | `1e-9`, half-away-from-zero → difiere en negativos | Bajo |

### Esquema: las dos implementaciones no pueden compartir el mismo `.db`

Columnas y CHECKs de `backend/migrations/001_init.sql` coinciden 1:1 con
`prisma/schema.prisma`, y los UNIQUE son correctos. Pero:

- Las fechas son **TEXT** en Go y `DATETIME` (entero en milisegundos) en Prisma-SQLite.
- `DEFAULT (datetime('now'))` produce `2026-08-03 12:00:00` mientras la app escribe
  RFC3339 `...T12:00:00Z` (`001_init.sql:10-11,26-27,54-55,79`): la ordenación y
  comparación de cadenas queda inconsistente si alguna fila usa el default.
- Los IDs son uuid en Go y cuid en Prisma.

---

## 5. Correctitud del backend Go

1. **Transacciones SQLite `DEFERRED`** (`inventory/service.go:114,238,380`): todas leen
   antes de escribir. Sin `BEGIN IMMEDIATE`, dos reservas concurrentes podrían sobrevender.
   Hoy lo enmascara `db.SetMaxOpenConns(1)` (`db/db.go:21`), que serializa el proceso
   entero pero elimina la concurrencia y no protege frente a un segundo proceso.
2. **Errores ignorados en cálculos que se persisten**:
   `inventory/service.go:288,351,353,395,500,502` e `imports/service.go:153` usan
   `_ = ...Scan(...)`. Ante un fallo se escriben `stock_after` / `available_after` = 0 en
   el histórico.
3. **`ExpireReservedQuotes` dentro de `ListProducts`** (`handlers/api.go:76`): ignora el
   error y expira N cotizaciones en N transacciones separadas dentro de un GET.
4. **`rows.Err()` nunca comprobado** (`inventory/service.go:78`): una iteración truncada
   pasa por éxito.
5. **Contexto de request no propagado**: se usan `QueryRow`/`Exec` en vez de las variantes
   `...Context(r.Context())`, así que el `chimw.Timeout(60s)` no cancela consultas.
6. **Sin CORS** (`main.go:44-49`) pese a que el frontend corre en :3000 y el backend en
   :8080.
7. `err.Error()` crudo al cliente (`handlers/api.go:79,96-97,116-117,227`) filtra detalles
   de SQL.
8. `http.ListenAndServe` sin `ReadHeaderTimeout` ni apagado ordenado (`main.go:102`).
9. `findBackendRoot()` (`main.go:107-120`) depende del CWD; preferible `embed.FS` para las
   migraciones.
10. Falta `PRAGMA journal_mode=WAL` en el DSN (`db/db.go:16`).
11. `inventory.Service.Available` (`service.go:35`) no se usa desde ningún handler: código
    muerto.
12. No hay tests; el `Makefile` carece de objetivos `test` / `vet`.

---

## 6. Frontend: APIs de Next.js 16

Verificado contra las guías de `node_modules/next/dist/docs/`.

### 6.1 `middleware.ts` está deprecado — debe ser `proxy.ts`

`src/middleware.ts:1-32`

`docs/01-app/03-api-reference/03-file-conventions/proxy.md` abre con: *"The `middleware`
file convention is deprecated and has been renamed to `proxy`"*, y la tabla de versiones
marca `v16.0.0 | Middleware is deprecated and renamed to Proxy`. El upgrade guide
(`02-guides/upgrading/version-16.md`) pide renombrar archivo **y** función
(`export function proxy(...)`). Confirmado en el binario:
`node_modules/next/dist/build/index.js:651` emite el `warnOnce` correspondiente.

Codemod: `npx @next/codemod@canary middleware-to-proxy .`

### 6.2 El matcher intercepta las rutas `/api/*` y rompe los `fetch` del cliente

`src/middleware.ts:29-31`

El negative lookahead solo excluye estáticos, así que `/api/quotes`, `/api/imports` e
`/api/inventory/adjust` pasan por el proxy. Sin sesión devuelve un **302 a `/login`
(HTML)** en lugar del 401 JSON que los route handlers ya implementan; el `fetch` sigue el
redirect y el `res.json()` del cliente revienta. La sección "Matcher / Negative matching"
de `proxy.md` muestra cómo excluir `api` explícitamente.

### 6.3 Mutaciones por route handler + `router.refresh()` en vez de Server Actions

`quote-actions.tsx:23-30`, `import-actions.tsx:23-32`, `adjust-stock-form.tsx:24-40`,
`new-quote-form.tsx:63-82`, `new-import-form.tsx:57-78`

`01-getting-started/07-mutating-data.md` (§"Refresh data") indica usar Server Actions +
`refresh()` de `next/cache`; `04-functions/refresh.md` aclara que *"`refresh` can only be
called from within Server Actions"*.

Con el patrón actual, `router.refresh()` solo limpia la Client Cache de la ruta actual.
Como `staleTimes.dynamic` vale 0, la navegación normal sí refetchea el inventario, **pero
el back/forward cache no se invalida** (*"This doesn't change back/forward caching
behavior"*): tras confirmar una cotización y pulsar Atrás, `/inventory` y `/dashboard`
muestran disponibilidad vieja. Mismo efecto tras marcar la llegada de una importación y
tras un ajuste de stock.

### 6.4 Formulario GET nativo en vez de `next/form`

`inventory/page.tsx:48-61`, y chips como `<a>` en `:64-82`.
`03-api-reference/02-components/form.md`: `<Form action="...">` hace navegación
client-side y prefetch. Hoy cada búsqueda o filtro es una recarga completa, cara en móvil.
Los chips deberían ser `<Link>`.

**Correcto:** `params` / `searchParams` se esperan como Promise en todas las páginas y
route handlers, conforme a la ruptura "Async Request APIs" de v16.

---

## 7. Frontend: UI, estado y accesibilidad

- **Ningún `fetch` tiene `try/catch`**: si la red móvil falla o la respuesta no es JSON, la
  promesa se rechaza, `setLoading(false)` nunca corre y el botón queda bloqueado en
  "Reservando…" para siempre. `new-quote-form.tsx:63-80`, `new-import-form.tsx:57-76`,
  `quote-actions.tsx:23-29`, `import-actions.tsx:23-31`, `adjust-stock-form.tsx:24-38`.
- **La búsqueda de inventario borra el filtro de tipo**: falta
  `<input type="hidden" name="type" value={type}>` en `inventory/page.tsx:48-61`.
- **Cero `loading.tsx` / `error.tsx` / `not-found.tsx`** en todo `src/app`. `notFound()` se
  llama en `quotes/[id]/page.tsx:31` e `imports/[id]/page.tsx:29` sin UI propia, y
  cualquier fallo de Prisma cae al error genérico.
- **`<Suspense>` sin `fallback`** en `login/page.tsx:85`: pantalla en blanco durante el CSR
  de `useSearchParams`.
- **Escrituras en base de datos durante el render** de Server Components:
  `expireReservedQuotes()` en `dashboard/page.tsx:26`, `quotes/page.tsx:15` y
  `movements/page.tsx:16` — ausente en `imports/page.tsx`, de ahí ETAs inconsistentes.
  Debería vivir solo en el cron.
- **`maximumScale: 1` bloquea el zoom** (`layout.tsx:34`): incumple WCAG 1.4.4.
- **Objetivos táctiles por debajo de 44 px**: nav inferior ~28 px (`nav.tsx:51`), botón
  "Ajustar" ~28 px (`adjust-stock-form.tsx:48`), botón "Nueva" ~32 px
  (`quotes/page.tsx:30`, `imports/page.tsx:30`), steppers `h-9 w-9`
  (`new-quote-form.tsx:172,185`) y `h-8 w-8` (`new-import-form.tsx:162,187`).
- **Sin nombre accesible** en los steppers `−`/`+`, y sin `aria-current="page"` en
  `nav.tsx:48-56`.
- **Toggles sin semántica**: ITBIS (`new-quote-form.tsx:221-241`) y Estado
  (`new-import-form.tsx:104-125`) son `<button>` sin `aria-pressed` ni `role="radiogroup"`;
  el `<Label>` de `:104` no apunta a ningún control.
- **Input de búsqueda sin label** (solo placeholder) en `inventory/page.tsx:49-54`.
- Ternario muerto en `movements/page.tsx:84-86`:
  `isPhysicalDrop || isReserve ? "text-ink" : "text-ink"`.
- Query inútil: `reservedQuotes` se calcula siempre pero solo se usa en la rama del
  vendedor (`dashboard/page.tsx:30-35`, `:256`).

### Duplicación

- `quote-actions.tsx` e `import-actions.tsx` son casi idénticos (estado `loading`/`error`
  más `act()`): extraer un `useAction()` compartido.
- La lógica `filtered` está duplicada literalmente entre `new-quote-form.tsx:50-58` y
  `new-import-form.tsx:35-43`, igual que el stepper de cantidad.
- El input de búsqueda inline (`inventory/page.tsx:53`) y los chips replican estilos de
  `Input` / `Button` en vez de usar `ui.tsx`; los steppers no usan `Button`.
- Doble separación `space-y-2` + `Card className="mb-2"` en `quotes/page.tsx:41/44`,
  `imports/page.tsx:42/53`, `dashboard/page.tsx:124/131`.
- `<img>` con `eslint-disable` en `product-thumb.tsx:30-35`: las imágenes son estáticas en
  `/public`, `next/image` daría AVIF/WebP y menos bytes en móvil.
- `globals.css:30`: `--font-mono: var(--font-geist-mono)` referencia una variable
  inexistente (resto de la plantilla).
- `Providers` / `SessionProvider` (`(app)/layout.tsx:12`) solo se usa para `signOut`, que
  no lo necesita: cliente extra innecesario.

---

## 8. Seguridad, hallazgos restantes

- **Rol tomado del JWT sin revalidar contra la base de datos**:
  `backend/internal/middleware/auth.go:23-28` construye el usuario desde los claims, con
  token de 30 días (`auth/auth.go:65`). Igual en `src/lib/auth.config.ts:9-15`, donde el
  rol solo se fija al iniciar sesión. Desactivar o degradar a un usuario no surte efecto
  hasta 30 días después.
- **`ParseToken` sin lista de algoritmos** (`backend/internal/auth/auth.go:74`): añadir
  `jwt.WithValidMethods([]string{"HS256"})`.
- **Sin rate limiting ni bloqueo tras intentos fallidos** en login
  (`backend/internal/handlers/api.go:37`, `src/lib/auth.ts:32`).
- **Enumeración de usuarios**: `backend/internal/auth/auth.go:49` distingue "usuario
  inactivo" de "credenciales inválidas".
- **Sin cabeceras de seguridad** (CSP, HSTS, X-Frame-Options) en `next.config.ts`.
- `include: { seller: true }` en `src/app/api/quotes/[id]/pdf/route.tsx:23` y en la página
  de detalle carga el `User` completo, con `passwordHash`. Hoy no se serializa al cliente,
  pero conviene `select: { name: true }`.

### Verificado sin hallazgos

- **Inyección SQL**: todas las consultas Go usan placeholders `?`; el único valor dinámico
  (`limit`) pasa por `strconv.Atoi` y va parametrizado. Los `fmt.Sprintf` solo arman notas
  de texto.
- **Exposición del hash de contraseña**: `models.go:46` usa `json:"-"` y el login devuelve
  campos explícitos.
- **Autorización de las rutas Next.js**: todas verifican sesión; `imports/*` e
  `inventory/adjust` exigen OWNER; las cotizaciones verifican propiedad. Las páginas
  filtran por `sellerId`.
- **Secretos en git**: solo `.env.example` y `backend/.env.example` están rastreados;
  `.gitignore` cubre `.env*` y `*.db`.

---

## 9. Reglas del README no implementadas

- **"Reserva 48h"**: no hay expiración programada — no existe `vercel.json` ni cron
  configurado. Depende de que alguien abra ciertas páginas o llame a mano a
  `/api/cron/expire-quotes`.
- **"Movimientos con contador de lo que queda"**: el contador es correcto en el momento de
  escritura, pero se corrompe por las liberaciones duplicadas de 2.3 y por el stock
  fraccionario de 2.5.
- **"Importaciones con ETA"**: la ETA se guarda pero no se usa en ninguna alerta ni en el
  ordenamiento; ningún estado refleja "vencida".
- **Estado `DRAFT`**: existe en el enum y en `cancelQuote`, pero ninguna ruta lo crea; no
  hay edición de cotización.

---

## 10. Orden sugerido

1. Bloqueantes de seguridad: 1.1 a 1.5.
2. Integridad de inventario: 2.1, 2.2, 2.3, 2.4, 2.5 más `@@unique([quoteId, productId])`.
3. Validación con zod en todas las rutas API (la dependencia ya está instalada).
4. Cron real de expiración y decidir el formato de fecha compartido entre Go y Prisma.
5. `middleware.ts` → `proxy.ts` y excluir `/api` del matcher.
6. Índices y tipo de dato para dinero.
7. Manejo de errores en el frontend (`try/catch`, `error.tsx`, `loading.tsx`) y
   accesibilidad móvil.
