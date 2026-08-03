# KN GOLD — Sistema móvil de inventario y cotizaciones

App para que el dueño y los vendedores de **KN GOLD** controlen inventario, cotizaciones (con/sin ITBIS), movimientos e importaciones.

## Dos implementaciones (migración en curso)

| Carpeta | Lenguaje | Estado |
|---------|----------|--------|
| raíz (`src/`, Next.js) | TypeScript | App en uso, en `http://localhost:3000` |
| [`backend/`](backend/) | **Go** | Portado parcial, **sin decidir** (ver aviso abajo) |

> **Aviso — las dos implementaciones no comparten datos.** Prisma crea tablas
> `Quote`/`QuoteLine` con columnas `quoteId`; Go crea `quotes`/`quote_lines`
> con `quote_id`. Apuntadas al mismo archivo `.db` generan dos juegos de
> tablas separados y cada una ve cero filas de la otra. Converger no es
> ajustar un detalle: es reescribir el esquema de una de las dos. Hasta que
> se decida, **la app real es la de Next.js** y `backend/` no debe usarse en
> producción: le faltan las correcciones de seguridad que sí tiene `src/`
> (ver `docs/revision-tecnica.md`).

### Cuentas

El seed crea `dueno@kngold.com.do`, `vendedor@kngold.com.do` y
`vendedor2@kngold.com.do`. La clave es la que pongas en `SEED_OWNER_PASSWORD`
— no hay ninguna por defecto, a propósito.

---

## Next.js (la app)

```bash
npm install
cp .env.example .env      # y completa AUTH_SECRET, CRON_SECRET y SEED_OWNER_PASSWORD
npx prisma db push
npm run db:seed
npm run dev
```

### Expiración de las reservas

Las reservas de 48 h las vence `GET /api/cron/expire-quotes`, que exige
`Authorization: Bearer $CRON_SECRET`. En Vercel lo dispara `vercel.json` cada
hora; fuera de Vercel hay que programarlo (cron del sistema, GitHub Actions o
similar). Sin ese cron, una reserva solo vence cuando alguien abre el panel,
las cotizaciones o los movimientos.

## Go (API nueva)

Requiere Go 1.24+ (si no está en PATH: `export PATH="$HOME/sdk/go/bin:$PATH"`).

```bash
cd backend
go run ./cmd/server
```

Endpoints principales:

- `POST /api/auth/login`
- `GET /api/products`
- `GET /api/movements`
- `POST /api/quotes` · confirm/cancel
- `POST /api/imports` · transit/arrive/cancel
- `POST /api/inventory/adjust`
- `GET /api/cron/expire-quotes`

## Documentos

- [`docs/revision-tecnica.md`](docs/revision-tecnica.md) — seguridad, lógica de negocio, modelo de datos y paridad TS ↔ Go.
- [`docs/revision-diseno.md`](docs/revision-diseno.md) — usabilidad, jerarquía visual y reglas de la línea gráfica.

## Funciones

- Inventario: disponible = físico − reservas
- Cotización con reserva 48h + ITBIS 18% opcional
- Movimientos con contador de lo que queda
- Importaciones con ETA y entrada a stock al llegar

## Orden de migración a Go

1. Dominio + API JSON (listo en `backend/`)
2. Pantallas HTML/HTMX o SPA contra la API Go
3. PDF cotización en Go
4. Retirar Next.js cuando la UI Go esté completa
