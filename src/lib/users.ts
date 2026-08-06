import bcrypt from "bcryptjs";
import { getDb, newId } from "./firebase";
import { countsTowardPlanSeats } from "./roles";
import type { LicenseSettings, Role, User } from "./types";
import type { ManagedUser, SeatInfo } from "./users-types";

export type { ManagedUser, SeatInfo } from "./users-types";
export const DEFAULT_MAX_PLAN_USERS = 5;
const LICENSE_DOC = "settings/license";

function nowIso() {
  return new Date().toISOString();
}

function isExpired(expiresAt?: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

function toManaged(u: User): ManagedUser {
  const expired = isExpired(u.expiresAt);
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active && !expired,
    isSupport: Boolean(u.isSupport),
    expiresAt: u.expiresAt ?? null,
    createdAt: u.createdAt,
    expired,
  };
}

export async function getLicense(): Promise<LicenseSettings> {
  const snap = await getDb().doc(LICENSE_DOC).get();
  if (!snap.exists) {
    return { maxUsers: DEFAULT_MAX_PLAN_USERS, updatedAt: nowIso(), note: null };
  }
  const data = snap.data() as Partial<LicenseSettings>;
  return {
    maxUsers: Math.max(1, Number(data.maxUsers) || DEFAULT_MAX_PLAN_USERS),
    updatedAt: String(data.updatedAt || nowIso()),
    note: data.note ?? null,
  };
}

export async function setLicenseMaxUsers(
  maxUsers: number,
  note?: string
): Promise<LicenseSettings> {
  if (!Number.isFinite(maxUsers) || maxUsers < 1 || maxUsers > 200) {
    throw new Error("Cupo inválido");
  }
  const license: LicenseSettings = {
    maxUsers: Math.floor(maxUsers),
    updatedAt: nowIso(),
    note: note?.trim() || null,
  };
  await getDb().doc(LICENSE_DOC).set(license, { merge: true });
  return license;
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const snap = await getDb().collection("users").get();
  const users = snap.docs.map((d) => toManaged({ id: d.id, ...d.data() } as User));
  users.sort((a, b) => {
    if (a.isSupport !== b.isSupport) return a.isSupport ? -1 : 1;
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.name.localeCompare(b.name, "es");
  });
  return users;
}

/** Usuarios del plan (vendedores + administradores; no soporte ni dueño). */
export async function countPlanSeatsUsed(): Promise<number> {
  const users = await listManagedUsers();
  return users.filter(
    (u) =>
      u.active && !u.isSupport && !u.expired && countsTowardPlanSeats(u.role)
  ).length;
}

export async function getSeatInfo(): Promise<SeatInfo> {
  const [license, users] = await Promise.all([getLicense(), listManagedUsers()]);
  const used = users.filter(
    (u) =>
      u.active && !u.isSupport && !u.expired && countsTowardPlanSeats(u.role)
  ).length;
  const ownerCount = users.filter(
    (u) => u.active && !u.isSupport && !u.expired && u.role === "OWNER"
  ).length;
  const supportActive = users.filter(
    (u) => u.active && u.isSupport && !u.expired
  ).length;
  return {
    maxUsers: license.maxUsers,
    used,
    remaining: Math.max(0, license.maxUsers - used),
    ownerCount,
    supportActive,
  };
}

async function assertEmailFree(email: string, exceptId?: string) {
  const snap = await getDb()
    .collection("users")
    .where("email", "==", email)
    .limit(1)
    .get();
  if (snap.empty) return;
  if (exceptId && snap.docs[0].id === exceptId) return;
  throw new Error("Ese correo ya está registrado");
}

export async function createPlanUser(input: {
  name: string;
  email: string;
  password: string;
  role?: Role;
}): Promise<ManagedUser> {
  const name = input.name.trim();
  const email = input.email.toLowerCase().trim();
  const password = input.password;
  const role: Role =
    input.role === "ADMIN" ? "ADMIN" : input.role === "OWNER" ? "OWNER" : "SELLER";

  if (!name) throw new Error("El nombre es obligatorio");
  if (!email || !email.includes("@")) throw new Error("Correo inválido");
  if (password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");
  if (role === "OWNER") {
    throw new Error("No se puede crear otro dueño desde aquí");
  }

  if (countsTowardPlanSeats(role)) {
    const seats = await getSeatInfo();
    if (seats.remaining <= 0) {
      throw new Error(
        `Límite de ${seats.maxUsers} usuarios del plan alcanzado. Contacte a su proveedor para ampliar el cupo.`
      );
    }
  }

  await assertEmailFree(email);
  const id = newId();
  const now = nowIso();
  const user: User = {
    id,
    name,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role,
    active: true,
    isSupport: false,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await getDb().collection("users").doc(id).set(user);
  return toManaged(user);
}

export async function createSupportUser(input: {
  name?: string;
  email: string;
  password: string;
  hours?: number;
}): Promise<ManagedUser> {
  const name = (input.name || "Soporte proveedor").trim();
  const email = input.email.toLowerCase().trim();
  const password = input.password;
  const hours = Math.min(168, Math.max(1, Number(input.hours) || 48));

  if (!email || !email.includes("@")) throw new Error("Correo inválido");
  if (password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");

  // Un solo acceso de soporte activo a la vez
  const existing = await listManagedUsers();
  const activeSupport = existing.find((u) => u.isSupport && u.active && !u.expired);
  if (activeSupport) {
    throw new Error(
      "Ya hay un acceso temporal activo. Revóquelo antes de crear otro."
    );
  }

  await assertEmailFree(email);
  const id = newId();
  const now = nowIso();
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  const user: User = {
    id,
    name,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role: "OWNER",
    active: true,
    isSupport: true,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  };
  await getDb().collection("users").doc(id).set(user);
  return toManaged(user);
}

export async function setUserActive(
  userId: string,
  active: boolean,
  actorId: string
): Promise<ManagedUser> {
  if (userId === actorId && !active) {
    throw new Error("No puedes desactivar tu propia cuenta");
  }

  const ref = getDb().collection("users").doc(userId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Usuario no encontrado");
  const user = { id: snap.id, ...snap.data() } as User;

  if (active) {
    if (isExpired(user.expiresAt)) {
      throw new Error("Este acceso temporal ya venció; crea uno nuevo");
    }
    if (!user.isSupport && countsTowardPlanSeats(user.role)) {
      const seats = await getSeatInfo();
      // Si estaba inactivo, no cuenta en used; al reactivar necesita cupo
      if (seats.remaining <= 0) {
        throw new Error(
          `Sin cupo disponible (${seats.maxUsers}). Contacte a su proveedor o desactive otro usuario.`
        );
      }
    }
  } else if (user.role === "OWNER" && !user.isSupport) {
    const owners = await listManagedUsers();
    const otherActiveOwners = owners.filter(
      (u) =>
        u.id !== userId &&
        u.role === "OWNER" &&
        !u.isSupport &&
        u.active &&
        !u.expired
    );
    if (otherActiveOwners.length === 0) {
      throw new Error("Debe quedar al menos un dueño activo");
    }
  }

  await ref.set({ active, updatedAt: nowIso() }, { merge: true });
  return toManaged({ ...user, active });
}

export async function revokeSupportUser(userId: string): Promise<ManagedUser> {
  const ref = getDb().collection("users").doc(userId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Usuario no encontrado");
  const user = { id: snap.id, ...snap.data() } as User;
  if (!user.isSupport) throw new Error("Solo aplica a accesos temporales");
  await ref.set({ active: false, updatedAt: nowIso() }, { merge: true });
  return toManaged({ ...user, active: false });
}

/** Desactiva en Firestore si el soporte expiró. Retorna si puede entrar. */
export async function ensureUserCanLogin(user: User): Promise<boolean> {
  if (!user.active) return false;
  if (isExpired(user.expiresAt)) {
    await getDb()
      .collection("users")
      .doc(user.id)
      .set({ active: false, updatedAt: nowIso() }, { merge: true });
    return false;
  }
  return true;
}
