import Link from "next/link";
import AppHeader from "@/components/app-header";
import styles from "../../auth.module.css";

/**
 * /auth/error — aviso cuando un enlace de correo no se pudo verificar
 * (caducado, ya usado o manipulado). Ofrece pedir otro correo.
 */

const MESSAGES: Record<string, string> = {
  missing: "El enlace no traía los datos necesarios para confirmar la cuenta.",
  expired: "El enlace ya caducó o se usó antes. Pide uno nuevo.",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const message = MESSAGES[reason ?? ""] ?? "El enlace no es válido.";

  return (
    <>
      <AppHeader />
      <main className={styles.auth}>
        <div className={styles.card}>
          <div className={styles.head}>
            <p className={styles.badge}>Enlace no válido</p>
            <h1 className={styles.title}>No pudimos confirmar el enlace</h1>
            <p className={styles.sub}>{message}</p>
          </div>

          <p className={styles.alt}>
            <Link className={styles.altLink} href="/forgot-password">
              Pedir otro correo
            </Link>
            {" · "}
            <Link className={styles.altLink} href="/login">
              Volver al acceso
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
