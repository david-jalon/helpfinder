"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import AppHeader from "@/components/app-header";
import { createClient } from "@/lib/supabase/client";
import styles from "../auth.module.css";

/**
 * /reset-password — elegir la contraseña nueva tras abrir el enlace del correo.
 *
 * El enlace de recuperación (verificado en /auth/confirm) deja al usuario con
 * una sesión temporal; aquí solo hay que escribir la contraseña nueva y
 * guardarla con `updateUser`.
 */

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setSending(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(translateUpdateError(error.message, error.status));
      setSending(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <>
      <AppHeader />
      <main className={styles.auth}>
        <div className={styles.card}>
          <div className={styles.head}>
            <p className={styles.badge}>Nueva contraseña</p>
            <h1 className={styles.title}>Elige tu contraseña</h1>
            <p className={styles.sub}>
              Ya verificamos el enlace. Escribe la contraseña que quieras usar
              a partir de ahora.
            </p>
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="password">
                Contraseña nueva
              </label>
              <input
                id="password"
                className={styles.input}
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="confirm-password">
                Repite la contraseña
              </label>
              <input
                id="confirm-password"
                className={styles.input}
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <button className={styles.submit} type="submit" disabled={sending}>
              {sending ? "Guardando..." : "Guardar contraseña"}
            </button>
          </form>

          <p className={styles.alt}>
            ¿El enlace ya no sirve?{" "}
            <Link className={styles.altLink} href="/forgot-password">
              Pide otro
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}

function translateUpdateError(message: string, status?: number): string {
  if (status === 429) {
    return "Demasiados intentos en poco tiempo. Espera un rato y vuelve a intentarlo.";
  }
  const map: Record<string, string> = {
    "New password should be different from the old password":
      "La contraseña nueva debe ser distinta de la anterior.",
    "Password should be at least 6 characters":
      "La contraseña debe tener al menos 6 caracteres.",
    "Auth session missing":
      "El enlace caducó. Pide uno nuevo para seguir.",
  };
  return map[message] ?? "No se pudo guardar la contraseña. Inténtalo de nuevo.";
}
