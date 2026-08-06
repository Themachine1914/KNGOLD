import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname, search } = req.nextUrl;

  // No usamos `req.nextUrl.origin`: next-auth reconstruye la petición con el
  // origen de AUTH_URL, así que si esa variable apunta a localhost (o a un
  // dominio viejo) todos los redirects mandan ahí y la app queda inservible.
  // El host real viene en las cabeceras que pone el proxy de Vercel.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : req.nextUrl.origin;

  const isLoggedIn = !!req.auth;
  const isLogin = pathname.startsWith("/login");

  if (!isLoggedIn && !isLogin) {
    const url = new URL("/login", origin);
    // Con el search incluido, volver a la búsqueda o al filtro que tenías
    // abierto después de iniciar sesión.
    url.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && isLogin) {
    return NextResponse.redirect(new URL("/dashboard", origin));
  }

  return NextResponse.next();
});

export const config = {
  // `api/` queda fuera a propósito: cada ruta de /api/** valida su propia
  // sesión y responde 401 en JSON. Si pasaran por aquí, una sesión vencida
  // devolvería un 302 al HTML de /login, y el `res.json()` del cliente
  // reventaría con un error de sintaxis en lugar de mandar a iniciar sesión.
  //
  // Las barras finales importan: sin ellas, una ruta futura como /apidocs
  // o /products-nuevos se saltaría el proxy por coincidencia de prefijo.
  matcher: [
    "/((?!api/|_next/|favicon.ico|favicon.png|icons/|brand/|products/|manifest.webmanifest|apple-icon.png|opengraph-image).*)",
  ],
};
