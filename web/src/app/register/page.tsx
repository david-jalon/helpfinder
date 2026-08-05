"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import AppHeader from "@/components/app-header";
import { createClient } from "@/lib/supabase/client";
import styles from "../auth.module.css";

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setSending(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });

    if (error) {
      setError(translateRegisterError(error.message, error.status));
      setSending(false);
      return;
    }

    // Si Supabase exige confirmar el email, no hay sesión todavía.
    if (!data.session) {
      setInfo(
        "Te enviamos un correo de confirmación. Ábrelo para activar tu cuenta."
      );
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
            <p className={styles.badge}>Alta de expediente</p>
            <h1 className={styles.title}>Crea tu cuenta</h1>
            <p className={styles.sub}>
              Gratis. Tú pones tu propia key de IA cuando configures tu perfil.
            </p>
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="name">
                Nombre
              </label>
              <input
                id="name"
                className={styles.input}
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

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
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <p className={styles.error}>{error}</p>}
            {info && <p className={styles.info}>{info}</p>}

            <button className={styles.submit} type="submit" disabled={sending}>
              {sending ? "Creando cuenta..." : "Crear cuenta"}
            </button>
          </form>

          <p className={styles.alt}>
            ¿Ya tienes cuenta?{" "}
            <Link className={styles.altLink} href="/login">
              Entra
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}

function translateRegisterError(message: string, status?: number): string {
  if (status === 429) {
    return "Demasiados intentos de registro en poco tiempo. Espera un rato y vuelve a intentarlo.";
  }
  const map: Record<string, string> = {
    "User already registered":
      "Ya existe una cuenta con ese correo. Entra o recupera la contraseña.",
    "Password should be at least 6 characters":
      "La contraseña debe tener al menos 6 caracteres.",
    "Unable to validate email address":
      "Ese correo no es válido. Compruébalo.",
    "Too many requests":
      "Demasiados intentos. Espera un momento y vuelve a intentarlo.",
  };
  return map[message] ?? "No se pudo crear la cuenta. Inténtalo de nuevo.";
}