import type { Metadata, Viewport } from "next";
import { DM_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const instrument = Instrument_Serif({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "KN GOLD — Control",
  description:
    "Inventario, pedidos y movimientos en tiempo real para KN GOLD",
  applicationName: "KN GOLD",
  manifest: "/manifest.webmanifest",
  metadataBase: new URL(
    process.env.AUTH_URL || "https://kngold-2711.vercel.app"
  ),
  icons: {
    icon: [
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "KN GOLD",
  },
  openGraph: {
    title: "KN GOLD — Control",
    description: "Inventario, pedidos y movimientos para KN GOLD",
    siteName: "KN GOLD",
    images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: "KN GOLD" }],
    type: "website",
    locale: "es_DO",
  },
  twitter: {
    card: "summary_large_image",
    title: "KN GOLD — Control",
    description: "Inventario, pedidos y movimientos para KN GOLD",
    images: ["/brand/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#151311",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${dmSans.variable} ${instrument.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
