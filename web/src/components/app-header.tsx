import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./app-header.module.css";

/**
 * Cabecera compartida de Helpfinder.
 *
 * Mismo estilo en todas las páginas: header sticky con blur y el logo
 * como enlace al buscador (`/`), copiando la distribución de la landing.
 * El contenido de la derecha se pasa como `children` (navegación
 * específica de cada página) o se omite en login/registro.
 */
export default function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.logo}>
          <span className={styles.logoIcon}>◈</span> Helpfinder
        </Link>
        {children ? <nav className={styles.nav}>{children}</nav> : null}
      </div>
    </header>
  );
}
