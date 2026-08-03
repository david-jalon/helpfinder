import type { Metadata } from "next";
import { Archivo, Courier_Prime, Inter } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

const courierPrime = Courier_Prime({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "helpfinder — ayudas públicas en España",
  description:
    "encuentra las subvenciones y ayudas públicas que te corresponden. Buscador gratuito de la BDNS.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${archivo.variable} ${inter.variable} ${courierPrime.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
