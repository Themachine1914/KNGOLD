import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const isLogin = pathname.startsWith("/login");

  if (!isLoggedIn && !isLogin) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && isLogin) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  // `api` queda fuera a propósito: cada ruta de /api/** valida su propia
  // sesión y responde 401 en JSON. Si pasaran por aquí, una sesión vencida
  // devolvería un 302 al HTML de /login, y el `res.json()` del cliente
  // reventaría con un error de sintaxis en lugar de mandar a iniciar sesión.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icons|products|manifest.webmanifest).*)",
  ],
};
