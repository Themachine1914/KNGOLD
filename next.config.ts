import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad para toda la app.
 *
 * `unsafe-inline` sigue en script-src porque Next inyecta scripts en línea
 * para hidratar; quitarlo exige nonces y rompe el arranque. style-src lo
 * necesita por los estilos en línea de next/font.
 *
 * `unsafe-eval` solo en desarrollo: los docs de esta versión
 * (02-guides/content-security-policy.md) confirman que en producción no hace
 * falta, y dejarlo puesto anula buena parte de la defensa contra XSS.
 */
const scriptSrc =
  "script-src 'self' 'unsafe-inline'" +
  (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline'",
      scriptSrc,
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
