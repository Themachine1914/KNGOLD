# KN GOLD — Sistema móvil de inventario y cotizaciones

App para que el dueño y los vendedores de **KN GOLD** controlen inventario, cotizaciones (con/sin ITBIS), movimientos e importaciones.

## Dos implementaciones (migración en curso)

| Carpeta | Lenguaje | Estado |
|---------|----------|--------|
| raíz (`src/`, Next.js) | TypeScript | App UI completa en `http://localhost:3000` |
| [`backend/`](backend/) | **Go** | API + dominio portado en `http://localhost:8080` |

### Cuentas demo

| Rol | Correo | Clave |
|-----|--------|-------|
| Dueño | `dueno@kngold.com.do` | `kngold2026` |
| Vendedor | `vendedor@kngold.com.do` | `kngold2026` |

---

## Next.js (UI actual)

```bash
npm install
npx prisma db push
npm run db:seed
npm run dev
```

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
