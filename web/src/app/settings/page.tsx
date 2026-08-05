"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import AppHeader from "@/components/app-header";
import type { ProfileType, Colectivo, Region } from "@/lib/domain/profile";
import { logout } from "@/lib/supabase/actions";
import styles from "./settings.module.css";

/**
 * Settings
 *
 * Página para ver y editar el perfil del usuario.
 * Carga los datos actuales y permite modificarlos.
 */

const PROFILE_OPTIONS: { value: ProfileType; label: string; icon: string }[] = [
  { value: "persona", label: "Persona", icon: "👤" },
  { value: "autonomo", label: "Autónomo", icon: "🔧" },
  { value: "sociedad", label: "Sociedad", icon: "🏢" },
  { value: "asociacion", label: "Asociación", icon: "🤝" },
  { value: "fundacion", label: "Fundación", icon: "🏛️" },
  { value: "otros", label: "Otro", icon: "📋" },
];

const COLECTIVOS: { value: Colectivo; label: string }[] = [
  { value: "jovenes", label: "Jóvenes" },
  { value: "estudiantes", label: "Estudiantes" },
  { value: "desempleados", label: "Desempleados" },
  { value: "mujeres", label: "Mujeres" },
  { value: "personas_con_discapacidad", label: "Discapacidad" },
  { value: "mayores", label: "Mayores" },
  { value: "inmigrantes", label: "Inmigrantes" },
  { value: "otros", label: "Otros" },
];

const REGIONES: { value: Region; label: string }[] = [
  { value: "andaluza", label: "Andalucía" },
  { value: "aragonesa", label: "Aragón" },
  { value: "asturiana", label: "Asturias" },
  { value: "balear", label: "Baleares" },
  { value: "canaria", label: "Canarias" },
  { value: "cantabrica", label: "Cantabria" },
  { value: "castellano_manchega", label: "C.-La Mancha" },
  { value: "castellano_leonesa", label: "C. y León" },
  { value: "catalana", label: "Cataluña" },
  { value: "extremena", label: "Extremadura" },
  { value: "gallega", label: "Galicia" },
  { value: "madrileña", label: "Madrid" },
  { value: "murciana", label: "Murcia" },
  { value: "navarra", label: "Navarra" },
  { value: "vasca", label: "País Vasco" },
  { value: "valenciana", label: "C. Valenciana" },
  { value: "ceuta", label: "Ceuta" },
  { value: "melilla", label: "Melilla" },
];

type ProfileData = {
  profileType: ProfileType;
  colectivos: Colectivo[];
  regiones: Region[];
  keywords: string;
  contextText: string;
};

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const [profileType, setProfileType] = useState<ProfileType>("persona");
  const [colectivos, setColectivos] = useState<Colectivo[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [keywords, setKeywords] = useState("");
  const [contextText, setContextText] = useState("");

  // Cargar perfil actual
  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch("/api/profile", { cache: "no-store" });
        const json = (await res.json()) as {
          ok: boolean;
          data: ProfileData | null;
        };

        if (!res.ok || !json.ok) {
          throw new Error("No se pudo cargar el perfil");
        }

        if (json.data) {
          setProfileType(json.data.profileType);
          setColectivos(json.data.colectivos ?? []);
          setRegiones(json.data.regiones ?? []);
          setKeywords(json.data.keywords ?? "");
          setContextText(json.data.contextText ?? "");
        }
      } catch {
        setMessage({ type: "error", text: "No se pudo cargar el perfil." });
      } finally {
        setLoading(false);
      }
    }

    void loadProfile();
  }, []);

  function toggleColectivo(c: Colectivo) {
    setColectivos((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }

  function toggleRegion(r: Region) {
    setRegiones((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileType,
          colectivos: profileType === "persona" ? colectivos : [],
          regiones,
          keywords: keywords.trim(),
          contextText: contextText.trim(),
        }),
      });

      const json = (await res.json()) as { ok: boolean; error?: string };

      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "No se pudo guardar");
      }

      setMessage({ type: "success", text: "Perfil guardado correctamente." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Error guardando el perfil",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <AppHeader>
          <Link className={styles.navLink} href="/dashboard">
            Mi panel
          </Link>
          <form action={logout}>
            <button className={styles.logout} type="submit">
              Cerrar sesión
            </button>
          </form>
        </AppHeader>
        <main className={styles.settings}>
          <div className={styles.card}>
            <p className={styles.loading}>Cargando perfil...</p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader>
        <Link className={styles.navLink} href="/dashboard">
          Mi panel
        </Link>
        <form action={logout}>
          <button className={styles.logout} type="submit">
            Cerrar sesión
          </button>
        </form>
      </AppHeader>
      <main className={styles.settings}>
        <div className={styles.card}>
        <div className={styles.head}>
          <p className={styles.badge}>Configuración</p>
          <h1 className={styles.title}>Tu perfil</h1>
          <p className={styles.sub}>
            Modifica tu perfil para afinar las alertas de ayudas.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* ── Tipo de perfil ── */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>¿Quién eres?</h2>
            <div className={styles.typeGrid}>
              {PROFILE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`${styles.typeOption} ${
                    profileType === opt.value ? styles.typeOptionSelected : ""
                  }`}
                  onClick={() => setProfileType(opt.value)}
                >
                  <span className={styles.typeIcon}>{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Colectivos (solo persona) ── */}
          {profileType === "persona" && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Colectivos</h2>
              <div className={styles.checkGroup}>
                {COLECTIVOS.map((c) => (
                  <label
                    key={c.value}
                    className={`${styles.checkItem} ${
                      colectivos.includes(c.value) ? styles.checkItemSelected : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      className={styles.checkInput}
                      checked={colectivos.includes(c.value)}
                      onChange={() => toggleColectivo(c.value)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* ── Regiones ── */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Regiones</h2>
            <div className={styles.checkGroup}>
              {REGIONES.map((r) => (
                <label
                  key={r.value}
                  className={`${styles.checkItem} ${
                    regiones.includes(r.value) ? styles.checkItemSelected : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    className={styles.checkInput}
                    checked={regiones.includes(r.value)}
                    onChange={() => toggleRegion(r.value)}
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </div>

          {/* ── Contexto ── */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Contexto</h2>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="keywords">
                Palabras clave
              </label>
              <input
                id="keywords"
                className={styles.input}
                type="text"
                placeholder="ej. innovación, digitalización, empleo"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="context">
                Cuéntanos más sobre ti
              </label>
              <textarea
                id="context"
                className={styles.textarea}
                placeholder="ej. Tengo una pequeña tienda de ropa en Madrid y me interesa digitalizarme..."
                value={contextText}
                onChange={(e) => setContextText(e.target.value)}
              />
            </div>
          </div>

          {/* ── Key Gemini ── */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>API Key de Gemini</h2>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="gemini-key">
                Tu key
              </label>
              <input
                id="gemini-key"
                className={styles.input}
                type="password"
                placeholder="Para cambiarla, introduce la nueva"
              />
              <p className={styles.hint}>
                Gratuita en{" "}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ai.google.dev
                </a>
                . Se usa solo en servidor, nunca se comparte.
              </p>
            </div>
          </div>

          {/* ── Mensajes ── */}
          {message && (
            <p className={message.type === "error" ? styles.error : styles.success}>
              {message.text}
            </p>
          )}

          {/* ── Guardar ── */}
          <button className={styles.save} type="submit" disabled={saving}>
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </form>
      </div>
    </main>
    </>
  );
}
