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
