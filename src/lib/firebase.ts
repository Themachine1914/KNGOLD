import { App, cert, getApps, initializeApp } from "firebase-admin/app";
import { Firestore, getFirestore } from "firebase-admin/firestore";

let app: App | undefined;
let db: Firestore | undefined;

function loadCredential() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (json) {
    const parsed = JSON.parse(json) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key.replace(/\\n/g, "\n"),
    };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Faltan credenciales Firebase. Configura FIREBASE_SERVICE_ACCOUNT o FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY"
    );
  }
  privateKey = privateKey.replace(/\\n/g, "\n");
  return { projectId, clientEmail, privateKey };
}

export function getDb(): Firestore {
  if (db) return db;
  if (!getApps().length) {
    const c = loadCredential();
    app = initializeApp({
      credential: cert({
        projectId: c.projectId,
        clientEmail: c.clientEmail,
        privateKey: c.privateKey,
      }),
      projectId: c.projectId,
    });
  } else {
    app = getApps()[0];
  }
  db = getFirestore(app);
  return db;
}

export function newId(): string {
  return getDb().collection("_").doc().id;
}

/** getAll() streams in one request; chunked so huge lists stay well-behaved. */
const BATCH_GET_CHUNK = 300;

/**
 * Lee muchos documentos por id en **una sola ida y vuelta** a Firestore.
 *
 * Sustituye al patrón `for (const x of xs) await doc(x).get()`, que en listas
 * de 8 filas ya costaba segundos: cada `.get()` es un viaje de red completo.
 * Devuelve un mapa id -> datos; los ids que no existen simplemente no aparecen.
 */
export async function getDocsByIds<T>(
  collection: string,
  ids: Iterable<string | undefined | null>
): Promise<Map<string, T>> {
  const unique = [...new Set([...ids].filter((id): id is string => Boolean(id)))];
  const out = new Map<string, T>();
  if (unique.length === 0) return out;

  const db = getDb();
  for (let i = 0; i < unique.length; i += BATCH_GET_CHUNK) {
    const chunk = unique.slice(i, i + BATCH_GET_CHUNK);
    const refs = chunk.map((id) => db.collection(collection).doc(id));
    const docs = await db.getAll(...refs);
    for (const doc of docs) {
      if (doc.exists) out.set(doc.id, { id: doc.id, ...doc.data() } as T);
    }
  }
  return out;
}
