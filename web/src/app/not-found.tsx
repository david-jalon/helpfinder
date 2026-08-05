import Link from "next/link";
import LogoMark from "@/components/logo-mark";

export default function NotFound() {
  return (
    <main style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", textAlign: "center", padding: "2rem" }}>
      <LogoMark size={48} />
      <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.4rem" }}>Esta página no se encuentra</p>
      <p style={{ color: "var(--fg-muted)" }}>La ayuda que buscas no existe o ya no está disponible.</p>
      <Link href="/" style={{ color: "var(--sello)", fontWeight: 600 }}>Volver al buscador</Link>
    </main>
  );
}