"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import styles from "../auth.module.css";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSending(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(translateLoginError(error.message, error.status));
      setSending(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <main className={styles.auth}>
      <div className={styles.card}>
        <div className={styles.head}>
          <p className={styles.badge}>Acceso de entrada</p>
          <h1 className={styles.title}>Entra en Helpfinder</h1>
          <p className={styles.sub}>
            Revisa cada día las ayudas que te corresponden.
          </p>
        </div>

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

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              className={styles.input}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button className={styles.submit} type="submit" disabled={sending}>
            {sending ? "Comprobando..." : "Entrar"}
          </button>
        </form>

        <p className={styles.alt}>
          ¿No tienes cuenta?{" "}
          <Link className={styles.altLink} href="/register">
            Regístrate
          </Link>
        </p>
      </div>
    </main>
  );
}

function translateLoginError(message: string, status?: number): string {
  if (status === 429) {
    return "Demasiados intentos en poco tiempo. Espera un rato y vuelve a intentarlo.";
  }
  const map: Record<string, string> = {
    "Invalid login credentials":
      "Correo o contraseña incorrectos. Comprueba los datos.",
    "Email not confirmed":
      "Todavía no has confirmado tu correo. Revisa tu bandeja de entrada.",
    "User not found": "No encontramos ninguna cuenta con ese correo.",
    "Too many requests":
      "Demasiados intentos. Espera un momento y vuelve a intentarlo.",
  };
  return map[message] ?? "No se pudo iniciar sesión. Inténtalo de nuevo.";
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}