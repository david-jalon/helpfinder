"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { ProfileType, Colectivo, Region } from "@/lib/domain/profile";
import styles from "./onboarding.module.css";

/**
 * Onboarding — Fase 8
 *
 * Mini-cuestionario guiado para crear el perfil del usuario.
 * Español llano: sin jerga jurídica ni códigos CNAE.
 * Cada paso pregunta algo concreto y el usuario elige.
 */

const TOTAL_STEPS = 4;

const PROFILE_OPTIONS: { value: ProfileType; label: string; icon: string }[] = [
  { value: "persona", label: "Persona particular", icon: "👤" },
  { value: "autonomo", label: "Autónomo", icon: "🔧" },
  { value: "sociedad", label: "Sociedad / empresa", icon: "🏢" },
  { value: "asociacion", label: "Asociación", icon: "🤝" },
  { value: "fundacion", label: "Fundación", icon: "🏛️" },
  { value: "otros", label: "Otro", icon: "📋" },
];

const COLECTIVOS: { value: Colectivo; label: string }[] = [
  { value: "jovenes", label: "Jóvenes" },
  { value: "estudiantes", label: "Estudiantes" },
  { value: "desempleados", label: "Desempleados" },
  { value: "mujeres", label: "Mujeres" },
  { value: "personas_con_discapacidad", label: "Personas con discapacidad" },
  { value: "mayores", label: "Mayores" },
  { value: "inmigrantes", label: "Inmigrantes" },
  { value: "otros", label: "Otros colectivos" },
];

const REGIONES: { value: Region; label: string }[] = [
  { value: "andaluza", label: "Andalucía" },
  { value: "aragonesa", label: "Aragón" },
  { value: "asturiana", label: "Asturias" },
  { value: "balear", label: "Islas Baleares" },
  { value: "canaria", label: "Islas Canarias" },
  { value: "cantabrica", label: "Cantabria" },
  { value: "castellano_manchega", label: "Castilla-La Mancha" },
  { value: "castellano_leonesa", label: "Castilla y León" },
  { value: "catalana", label: "Cataluña" },
  { value: "extremena", label: "Extremadura" },
  { value: "gallega", label: "Galicia" },
  { value: "madrileña", label: "Comunidad de Madrid" },
  { value: "murciana", label: "Región de Murcia" },
  { value: "navarra", label: "Navarra" },
  { value: "vasca", label: "País Vasco" },
  { value: "valenciana", label: "Comunidad Valenciana" },
  { value: "ceuta", label: "Ceuta" },
  { value: "melilla", label: "Melilla" },
];

export default function OnboardingPage() {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [profileType, setProfileType] = useState<ProfileType | "">("");
  const [colectivos, setColectivos] = useState<Colectivo[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [keywords, setKeywords] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

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

  function canAdvance(): boolean {
    if (step === 1) return profileType !== "";
    if (step === 2) return true; // colectivos es opcional (solo persona)
    if (step === 3) return regiones.length > 0;
    return true;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!geminiApiKey.trim()) {
      setError("Necesitas tu key de Gemini para que la IA funcione. Consíguela gratis en ai.google.dev.");
      return;
    }

    setSending(true);

    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileType,
          colectivos: profileType === "persona" ? colectivos : [],
          regiones,
          keywords: keywords.trim(),
          geminiApiKey: geminiApiKey.trim(),
        }),
      });

      const json = (await res.json()) as { ok: boolean; error?: string };

      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "No se pudo guardar el perfil");
      }

      // Perfil guardado: ir al dashboard
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando el perfil");
      setSending(false);
    }
  }

  return (
    <main className={styles.onboarding}>
      <div className={styles.card}>
        <div className={styles.head}>
          <p className={styles.badge}>Expediente nuevo</p>
          <h1 className={styles.title}>Cuéntanos sobre ti</h1>
          <p className={styles.sub}>
            Solo un par de cosas para encontrar las ayudas que te corresponden.
          </p>
        </div>

        {/* Barra de progreso */}
        <div className={styles.progress}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={`${styles.progressDot} ${
                i + 1 === step
                  ? styles.progressDotActive
                  : i + 1 < step
                  ? styles.progressDotDone
                  : ""
              }`}
            />
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {/* ── Paso 1: Tipo de perfil ── */}
          {step === 1 && (
            <div className={styles.step}>
              <h2 className={styles.stepTitle}>¿Quién eres?</h2>
              <p className={styles.stepDescription}>
                Esto nos dice qué tipo de ayudas pueden interesarte. No te
                preocupes: luego puedes cambiarlo.
              </p>

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
          )}

          {/* ── Paso 2: Colectivos (solo persona) ── */}
          {step === 2 && (
            <div className={styles.step}>
              <h2 className={styles.stepTitle}>¿Perteneces a algún colectivo?</h2>
              <p className={styles.stepDescription}>
                Algunas ayudas son solo para ciertos grupos. Selecciona los que
                encajen contigo (puedes dejarlo vacío).
              </p>

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

          {/* ── Paso 3: Regiones ── */}
          {step === 3 && (
            <div className={styles.step}>
              <h2 className={styles.stepTitle}>¿Dónde vives o trabajas?</h2>
              <p className={styles.stepDescription}>
                Muchas ayudas son por comunidad autónoma. Selecciona al menos una.
              </p>

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
          )}

          {/* ── Paso 4: Contexto + Key Gemini ── */}
          {step === 4 && (
            <div className={styles.step}>
              <h2 className={styles.stepTitle}>Un poco más de contexto</h2>
              <p className={styles.stepDescription}>
                Esto ayuda a la IA a entender mejor tu situación. Opcional pero
                recomendable.
              </p>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="keywords">
                  ¿Qué tipo de ayudas buscas?
                </label>
                <input
                  id="keywords"
                  className={styles.input}
                  type="text"
                  placeholder="ej. innovación, digitalización, empleo juvenil"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="gemini-key">
                  Tu API key de Gemini
                </label>
                <input
                  id="gemini-key"
                  className={styles.input}
                  type="password"
                  placeholder="AIza..."
                  required
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
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
          )}

          {/* ── Mensajes ── */}
          {error && <p className={styles.error}>{error}</p>}

          {/* ── Botones ── */}
          <div className={styles.actions}>
            {step > 1 && (
              <button
                type="button"
                className={styles.back}
                onClick={() => setStep((s) => s - 1)}
              >
                Atrás
              </button>
            )}

            {step < TOTAL_STEPS ? (
              <button
                type="button"
                className={styles.submit}
                disabled={!canAdvance()}
                onClick={() => setStep((s) => s + 1)}
              >
                Siguiente
              </button>
            ) : (
              <button
                type="submit"
                className={styles.submit}
                disabled={sending}
              >
                {sending ? "Guardando..." : "Guardar perfil"}
              </button>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}
