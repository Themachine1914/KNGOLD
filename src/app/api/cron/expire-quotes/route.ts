import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { expireReservedQuotes } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";

/**
 * Este endpoint escribe en la base de datos, así que exige su propio secreto.
 *
 * Antes caía a `AUTH_SECRET` cuando no había `CRON_SECRET`, y si tampoco
 * existía ese, `secret` quedaba `undefined` y el guardia no llegaba a
 * ejecutarse: el endpoint quedaba abierto. Reutilizar `AUTH_SECRET` además
 * lo repartía por configuraciones de cron y registros, y con él se pueden
 * firmar sesiones.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  // timingSafeEqual exige longitudes iguales y no filtra por tiempo.
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET no está configurado en el servidor" },
      { status: 503 }
    );
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const count = await expireReservedQuotes(prisma);
  return NextResponse.json({ ok: true, expired: count });
}

export async function POST(req: Request) {
  return GET(req);
}
