import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { authConfig } from "./auth.config";
import { prisma } from "./prisma";
import { clearAttempts, isBlocked, registerFailure } from "./rate-limit";

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
      async authorize(credentials) {
        const email = String(credentials?.email || "").toLowerCase().trim();
        const password = String(credentials?.password || "");
        if (!email || !password) return null;

        // Frena el fuerza bruta y el gasto de CPU de bcrypt. El corte va
        // antes de tocar la base de datos.
        if (isBlocked(email)) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) {
          registerFailure(email);
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          registerFailure(email);
          return null;
        }

        clearAttempts(email);
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
  if (session.user.role !== Role.OWNER) throw new Error("FORBIDDEN");
  return session;
}
