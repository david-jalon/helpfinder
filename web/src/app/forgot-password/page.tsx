"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import AppHeader from "@/components/app-header";
import { createClient } from "@/lib/supabase/client";
import styles from "../auth.module.css";

/**
 * /forgot-password — pide un correo para restablecer la contraseña.
 *
 * Por seguridad, la respuesta es SIEMPRE la misma ("si existe una cuenta..."):
 * así nadie puede averiguar qué correos están registrados probando aquí.
 */

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSending(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
    });

    setSending(false);

    if (error) {
      setError(translateResetError(error.message, error.status));
      return;
    }

    setSent(true);
  }

  return (
    <>
      <AppHeader />
      <main className={styles.auth}>
        <div className={styles.card}>
          <div className={styles.head}>
            <p className={styles.badge}>Nueva contraseña</p>
            <h1 className={styles.title}>Recupera tu acceso</h1>
            <p className={styles.sub}>
              Te enviaremos un enlace a tu correo para elegir una contraseña
              nueva.
            </p>
          </div>

          {sent ? (
            <p className={styles.info}>
              Si existe una cuenta con ese correo, te enviamos un enlace.
              Revisa tu bandeja de entrada (y la carpeta de spam).
            </p>
          ) : (
            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="email">
                  Correo electrónico
                </label>
                <input
                  id="email"
                  className={styles.input}
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {error && <p className={styles.error}>{error}</p>}

              <button className={styles.submit} type="submit" disabled={sending}>
                {sending ? "Enviando..." : "Enviar enlace"}
              </button>
            </form>
          )}

          <p className={styles.alt}>
            <Link className={styles.altLink} href="/login">
              Volver al acceso
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}

function translateResetError(message: string, status?: number): string {
  if (status === 429) {
    return "Demasiadas peticiones en poco tiempo. Espera un rato y vuelve a intentarlo.";
  }
  const map: Record<string, string> = {
    "Unable to validate email address": "Ese correo no es válido. Compruébalo.",
    "Too many requests":
      "Demasiadas peticiones. Espera un momento y vuelve a intentarlo.",
  };
  return map[message] ?? "No se pudo enviar el correo. Inténtalo de nuevo.";
}
