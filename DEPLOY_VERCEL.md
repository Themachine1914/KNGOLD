# Deploy KN GOLD en Vercel + Firebase

## 1. Crear proyecto Firebase

1. Abre https://console.firebase.google.com
2. **Add project** → nombre `kngold`
3. Activa **Firestore Database** → Create database → modo **production** (o test temporal)
4. Ve a ⚙️ **Project settings** → **Service accounts** → **Generate new private key**
5. Se descarga un JSON. Lo usarás en Vercel.

## 2. Variables en Vercel

Proyecto **kngold** → **Settings** → **Environment Variables**:

| Name | Value |
|------|--------|
| `AUTH_SECRET` | https://generate-secret.vercel.app/32 |
| `AUTH_URL` | `https://TU-PROYECTO.vercel.app` |
| `FIREBASE_SERVICE_ACCOUNT` | pega el JSON completo del service account (en una línea) |

Tip: el JSON debe ir como string. En Vercel pégalo tal cual; si falla, escapa los saltos de línea del `private_key` como `\n`.

## 3. Seed (usuarios y productos)

En tu Mac, con las mismas variables en `.env`:

```bash
npm run db:seed
```

Login demo:
- `dueno@kngold.com.do` / `kngold2026`
- `vendedor@kngold.com.do` / `kngold2026`

## 4. Redeploy en Vercel

**Deployments** → **Redeploy**
