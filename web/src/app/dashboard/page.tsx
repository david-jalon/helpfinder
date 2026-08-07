"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/app-header";
import Lightbulb from "@/components/lightbulb";
import { logout } from "@/lib/supabase/actions";
import {
  buildTabSummary,
  isNoiseAlert,
  type AlertDTO,
  type AlertDecision,
} from "@/lib/dashboard/triage";
import styles from "./dashboard.module.css";

/**
 * Dashboard — diario de decisiones
 *
 * Cliente: al montar pide a /api/dashboard el diario completo (nuevas
 * puntuadas con la key del usuario o fallback por reglas + todo lo
 * persistido). Cada convocatoria se tria con Seguir / Posible / Denegar:
 * la decisión se guarda en BD y sobrevive a recargar la página.
 * Pestañas: Pendientes · En seguimiento · Posibles · Denegadas.
 */

type DashboardData = {
  alerts: AlertDTO[];
  aiStatus: "ok" | "fallback" | null;
  aiMessage: string | null;
};

type PageState =
  | { kind: "loading" }
  | { kind: "needsProfile" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: DashboardData };

type TabKey = "pendientes" | "seguimiento" | "posibles" | "denegadas";

const TABS: { key: TabKey; label: string }[] = [
  { key: "pendientes", label: "Pendientes" },
  { key: "seguimiento", label: "En seguimiento" },
  { key: "posibles", label: "Posibles" },
  { key: "denegadas", label: "Denegadas" },
];

const DECISION_BTN: { key: Exclude<AlertDecision, null>; label: string }[] = [
  { key: "seguir", label: "Seguir" },
  { key: "posible", label: "Posible" },
  { key: "denegada", label: "Denegar" },
];

function matchesTab(decision: AlertDecision, tab: TabKey): boolean {
  switch (tab) {
    case "pendientes":
      return decision === null;
    case "seguimiento":
      return decision === "seguir";
    case "posibles":
      return decision === "posible";
    case "denegadas":
      return decision === "denegada";
  }
}

export default function DashboardPage() {
  const [state, setState] = useState<PageState>({ kind: "loading" });

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const res = await fetch("/api/dashboard", { cache: "no-store" });
        const json = (await res.json()) as {
          ok: boolean;
          error?: string;
          needsProfile?: boolean;
          data: DashboardData | null;
        };

        if (!res.ok || !json.ok) {
          throw new Error(json.error ?? "No se pudo cargar el panel");
        }

        if (json.needsProfile || !json.data) {
          if (mounted) setState({ kind: "needsProfile" });
          return;
        }

        if (mounted) setState({ kind: "ready", data: json.data });
      } catch (err) {
        if (mounted) {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : "Error cargando el panel",
          });
        }
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <>
      <AppHeader>
        <a href="/guia" className={styles.guideLink}>
          <Lightbulb size={16} className={styles.guideIcon} />
          Guía
        </a>
        <a href="/settings" className={styles.navLink}>
          Mi perfil
        </a>
        <form action={logout}>
          <button className={styles.logout} type="submit">
            Cerrar sesión
          </button>
        </form>
      </AppHeader>

      <main className={styles.dash}>
      {state.kind === "loading" && (
        <section className={styles.center}>
          <p className={styles.loading}>Abriendo tu expediente de hoy...</p>
        </section>
      )}

      {state.kind === "needsProfile" && (
        <section className={styles.center}>
          <p className={styles.eyebrow}>Expediente</p>
          <h1 className={styles.centerTitle}>Todavía no te conocemos</h1>
          <p className={styles.centerSub}>
            Para saber qué ayudas encajan contigo, cuéntanos primero quién eres.
          </p>
          <a className={styles.cta} href="/onboarding">
            Completar mi perfil
          </a>
        </section>
      )}

      {state.kind === "error" && (
        <section className={styles.center}>
          <p className={styles.eyebrow}>Expediente</p>
          <h1 className={styles.centerTitle}>No se pudo abrir el expediente</h1>
          <p className={styles.centerSub}>{state.message}</p>
          <a className={styles.cta} href="/dashboard">
            Reintentar
          </a>
        </section>
      )}

      {state.kind === "ready" && <Ready data={state.data} />}
      </main>
    </>
  );
}

function Ready({ data }: { data: DashboardData }) {
  const [activeTab, setActiveTab] = useState<TabKey>("pendientes");
  const [overrides, setOverrides] = useState<Record<string, AlertDecision>>({});
  const [toast, setToast] = useState<{ alert: AlertDTO } | null>(null);
  const toastTimer = useRef<number | null>(null);

  // La decisión visible = lo que el servidor devolvió + cambios optimistas.
  // Se descartan las alertas de ruido (solo personas jurídicas o «maybe» sin
  // señal IA): no se listan ni cuentan hasta que haya datos o IA. No se
  // borran de user_alerts: siguen en el diario persistido.
  const alerts = useMemo(
    () =>
      data.alerts
        .map((alert) => ({
          ...alert,
          decision: alert.id in overrides ? overrides[alert.id] : alert.decision,
        }))
        .filter((alert) => !isNoiseAlert(alert)),
    [data.alerts, overrides]
  );

  const summary = useMemo(() => buildTabSummary(alerts), [alerts]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  function showToast(alert: AlertDTO) {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ alert });
    toastTimer.current = window.setTimeout(() => setToast(null), 6000);
  }

  async function applyDecision(alert: AlertDTO, decision: AlertDecision) {
    // Si ya estaba en ese estado, un clic deshace (vuelve a Pendientes).
    const current = alert.id in overrides ? overrides[alert.id] : alert.decision;
    const next = current === decision ? null : decision;

    setOverrides((prev) => ({ ...prev, [alert.id]: next }));

    try {
      const res = await fetch(`/api/alerts/${alert.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: next }),
      });
      if (!res.ok) throw new Error();
      if (next === "denegada") showToast(alert);
    } catch {
      // Revertir el cambio optimista si la API falla.
      setOverrides((prev) => {
        const copy = { ...prev };
        if (copy[alert.id] === next) delete copy[alert.id];
        return copy;
      });
    }
  }

  function undo() {
    if (!toast) return;
    void applyDecision(toast.alert, toast.alert.decision);
    setToast(null);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }

  const inTab = alerts.filter((alert) => matchesTab(alert.decision, activeTab));

  // «Para ti» = ayudas con señal real: matched (región, keyword o
  // colectivo, o ámbito nacional con beneficiario) + maybe puntuado por la
  // IA. Sin IA, un «maybe» sin señal es ruido y no entra aquí.
  const isForYou = (alert: AlertDTO) =>
    alert.bucket === "matched" ||
    (alert.bucket === "maybe" && alert.aiStatus === "ok");

  const forYou = inTab.filter(isForYou).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const excluded = inTab.filter((alert) => !isForYou(alert));

  return (
    <>
      {/* ── cabecera del diario ── */}
      <section className={styles.head}>
        <p className={styles.eyebrow}>Expediente</p>
        <h1 className={styles.summary}>Tu diario de ayudas</h1>
        <p className={styles.headSub}>
          Lo nuevo de hoy entra por Pendientes; tú decides a dónde va.
        </p>
      </section>

      {/* ── pestañas con contador ── */}
      <nav className={styles.tabs} aria-label="Estado de tus ayudas">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`${styles.tab} ${
              activeTab === tab.key ? styles.tabActive : ""
            }`}
            aria-pressed={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            <span className={styles.tabCount}>{summary[tab.key]}</span>
          </button>
        ))}
      </nav>

      {/* ── aviso de fallback (sin IA) ── */}
      {data.aiStatus === "fallback" && (
        <div className={styles.notice}>
          <span className={styles.noticeLabel}>Encaje por reglas</span>
          <p className={styles.noticeText}>
            {data.aiMessage ?? "No se puntuó con IA."} Añade tu key de Gemini
            para recibir puntuación y motivo de cada ayuda.
          </p>
          <a className={styles.noticeLink} href="/settings">
            Configurar en Ajustes →
          </a>
        </div>
      )}

      {/* ── sin nada en esta pestaña ── */}
      {inTab.length === 0 && (
        <section className={styles.empty}>
          <p className={styles.emptyTitle}>{EMPTY_TITLES[activeTab]}</p>
          <p className={styles.emptyText}>{EMPTY_TEXTS[activeTab]}</p>
        </section>
      )}

      {activeTab === "pendientes" ? (
        <>
          {/* ── para ti ── */}
          {forYou.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                Para ti{" "}
                <span className={styles.sectionCount}>{forYou.length}</span>
              </h2>
              <ul className={styles.cardList}>
                {forYou.map((alert) => (
                  <Card key={alert.id} alert={alert} onTriage={applyDecision} />
                ))}
              </ul>
            </section>
          )}

          {/* ── todas las nuevas (excluidas) ── */}
          {excluded.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                Todas las nuevas{" "}
                <span className={styles.sectionCount}>{excluded.length}</span>
              </h2>
              <div className={styles.excludedCard}>
                <p className={styles.excludedRemark}>Revisa por si acaso</p>
                <p className={styles.excludedRemarkText}>
                  Ayudas que no entraron en «Para ti» porque son de otra región;
                  a veces se escapa una buena.
                </p>
                <ul className={styles.excludedList}>
                  {excluded.map((alert) => (
                    <li key={alert.id} className={styles.excludedRow}>
                      <div className={styles.excludedInfo}>
                        <span className={styles.excludedTitle}>
                          {alert.title}
                        </span>
                        {alert.sourceUrl && (
                          <a
                            className={styles.link}
                            href={alert.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Ver en BDNS →
                          </a>
                        )}
                      </div>
                      <Triage alert={alert} onTriage={applyDecision} />
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </>
      ) : (
        /* ── resto de pestañas: una sola lista ── */
        inTab.length > 0 && (
          <section className={styles.section}>
            <ul className={styles.cardList}>
              {inTab.map((alert) => (
                <Card
                  key={alert.id}
                  alert={alert}
                  onTriage={applyDecision}
                  muted={activeTab === "denegadas"}
                />
              ))}
            </ul>
          </section>
        )
      )}

      {/* ── toast de deshacer ── */}
      {toast && (
        <div className={styles.toast} role="status">
          <span>Descartada: {toast.alert.title}</span>
          <button className={styles.toastAction} type="button" onClick={undo}>
            Deshacer
          </button>
        </div>
      )}
    </>
  );
}

const EMPTY_TITLES: Record<TabKey, string> = {
  pendientes: "No hay ayudas pendientes.",
  seguimiento: "Nada en seguimiento todavía.",
  posibles: "Sin posibles por ahora.",
  denegadas: "No has descartado ninguna.",
};

const EMPTY_TEXTS: Record<TabKey, string> = {
  pendientes:
    "Cuando el registro diario detecte ayudas nuevas, entrarán aquí para que decidas.",
  seguimiento:
    "Marca una ayuda como «Seguir» y la guardarás aquí para no perderla de vista.",
  posibles:
    "Las ayudas que te interesen sin decidirte aún se quedan en «Posibles».",
  denegadas:
    "Las que descartes aparecerán aquí, por si quieres recuperar alguna.",
};

function Card({
  alert,
  onTriage,
  muted = false,
}: {
  alert: AlertDTO;
  onTriage: (alert: AlertDTO, decision: AlertDecision) => void;
  muted?: boolean;
}) {
  return (
    <li className={`${styles.card} ${muted ? styles.cardDenegada : ""}`}>
      <div className={styles.cardTop}>
        <span className={styles.ref}>{alert.grantId}</span>
        {alert.score !== null && (
          <span
            className={
              alert.aiStatus === "ok" ? styles.score : styles.scoreFallback
            }
          >
            {alert.aiStatus === "ok"
              ? `PUNTUACIÓN ${alert.score}/100`
              : "Encaje por reglas"}
          </span>
        )}
      </div>
      <h3 className={styles.cardTitle}>{alert.title}</h3>
      {alert.organization && (
        <p className={styles.cardOrg}>{alert.organization}</p>
      )}
      {alert.reason && <p className={styles.cardReason}>{alert.reason}</p>}
      {!alert.reason && alert.matchReasons.length > 0 && (
        <p className={styles.cardReason}>{alert.matchReasons.join(" · ")}</p>
      )}
      <div className={styles.cardActions}>
        {alert.sourceUrl && (
          <a
            className={styles.link}
            href={alert.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver en BDNS →
          </a>
        )}
        <Triage alert={alert} onTriage={onTriage} />
      </div>
    </li>
  );
}

function Triage({
  alert,
  onTriage,
}: {
  alert: AlertDTO;
  onTriage: (alert: AlertDTO, decision: AlertDecision) => void;
}) {
  const decision = alert.decision;

  return (
    <div className={styles.triage} role="group" aria-label="Triaje de esta ayuda">
      {DECISION_BTN.map((btn) => {
        const active = decision === btn.key;
        return (
          <button
            key={btn.key}
            type="button"
            className={`${styles.triageBtn} ${styles[btn.key]} ${
              active ? styles.active : ""
            }`}
            aria-pressed={active}
            onClick={() => onTriage(alert, btn.key)}
          >
            {btn.label}
          </button>
        );
      })}
    </div>
  );
}
