import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { getDb } from "./firebase";
import { attemptKey, clearAttempts, isBlocked, registerFailure } from "./rate-limit";
import type { Role, User } from "./types";

declare module "next-auth" {
  interface User {
    role: Role;
  }
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role: Role;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const email = String(credentials?.email || "").toLowerCase().trim();
        const password = String(credentials?.password || "");
        if (!email || !password) return null;

        // Frena el fuerza bruta y el gasto de CPU de bcrypt. El corte va
        // antes de tocar la base de datos.
        const ip =
          request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
        const key = attemptKey(email, ip);
        if (isBlocked(key)) return null;

        const snap = await getDb()
          .collection("users")
          .where("email", "==", email)
          .limit(1)
          .get();
        if (snap.empty) {
          registerFailure(key);
          return null;
        }
        const doc = snap.docs[0];
        const user = { id: doc.id, ...doc.data() } as User;
        if (!user.active) {
          registerFailure(key);
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          registerFailure(key);
          return null;
        }

        clearAttempts(key);
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
});

export async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  return session;
}

export async function requireOwner() {
  const session = await requireSession();
  if (session.user.role !== "OWNER") throw new Error("FORBIDDEN");
  return session;
}
