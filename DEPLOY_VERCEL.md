# Deploy KN GOLD en Vercel + Firebase

## 1. Crear proyecto Firebase

1. Abre https://console.firebase.google.com
2. **Add project** → nombre `kngold`
3. Activa **Firestore Database** → Create database → modo **production**.
   No lo dejes en modo de prueba: ese modo abre la base a cualquiera que
   conozca el projectId, y el histórico incluye precios, clientes y ventas.
4. Ve a ⚙️ **Project settings** → **Service accounts** → **Generate new private key**
5. Se descarga un JSON. Lo usarás en Vercel.

### Cerrar la base

La app entra solo desde el servidor con el SDK de administrador, que se salta
las reglas. Aun así, publica `firestore.rules` para que nadie más pueda entrar:

```bash
npx firebase-tools deploy --only firestore:rules
```

## 2. Variables en Vercel

Proyecto **kngold** → **Settings** → **Environment Variables**:

| Name | Value | Obligatoria |
|------|--------|-------------|
| `AUTH_SECRET` | https://generate-secret.vercel.app/32 | sí |
| `AUTH_URL` | `https://TU-PROYECTO.vercel.app` — el dominio **exacto**, sin barra final | sí |
| `FIREBASE_SERVICE_ACCOUNT` | el JSON completo del service account, en una línea | sí |
| `CRON_SECRET` | `openssl rand -base64 32` | sí |
| `SEED_OWNER_PASSWORD` | la clave inicial de las cuentas | solo para sembrar |
| `RESERVATION_HOURS` | `48` si quieres cambiar la duración de la reserva | no |

**`AUTH_URL` importa más de lo que parece.** next-auth reconstruye la petición
con ese origen; si apunta a `localhost` o a un dominio viejo, la app redirige
a los usuarios fuera del sitio y queda inservible.

**`CRON_SECRET` es obligatoria.** Sin ella, `/api/cron/expire-quotes` responde
503 y las reservas de 48 h no vencen solas: el stock se queda apartado para
siempre. Vercel envía `Authorization: Bearer $CRON_SECRET` a los crons de
`vercel.json` solo si la variable existe.

Tip: el JSON del service account debe ir como string. En Vercel pégalo tal
cual; si falla, escapa los saltos de línea del `private_key` como `\n`.

## 3. Cron de expiración

`vercel.json` programa `/api/cron/expire-quotes` cada hora. **En el plan Hobby
los crons corren una vez al día**, así que una reserva puede tardar hasta 24 h
en liberarse. Con plan Pro corre cada hora como está escrito.

## 4. Seed (usuarios y productos)

En tu Mac, con las mismas variables en `.env`:

```bash
SEED_OWNER_PASSWORD="la-clave-que-elijas" npm run db:seed
```

Crea `dueno@kngold.com.do` (dueño), `vendedor@kngold.com.do` y
`vendedor2@kngold.com.do` (vendedores), todos con esa clave. No hay ninguna
por defecto: el seed falla si no la das.

Cambia la clave después del primer ingreso.

## 5. Redeploy en Vercel

**Deployments** → **Redeploy**
