"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/app-header";
import Lightbulb from "@/components/lightbulb";
import GrantDetailModal from "@/components/grant-detail-modal";
import { logout } from "@/lib/supabase/actions";
import {
  buildTabSummary,
  isNoiseAlert,
  triageActionsFor,
  type AlertDTO,
  type AlertDecision,
} from "@/lib/dashboard/triage";
import { deadlineState, deadlineView, resolveEffectiveDeadline } from "@/lib/domain/deadline";
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

/** Score mínimo de IA para que un «maybe» entre en «Para ti». */
const MIN_SCORE_PARA_TI = 50;

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
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<AlertDTO | null>(null);
  const [detailAlert, setDetailAlert] = useState<AlertDTO | null>(null);
  const [toast, setToast] = useState<{ alert: AlertDTO } | null>(null);
  const toastTimer = useRef<number | null>(null);

  // La decisión visible = lo que el servidor devolvió + cambios optimistas.
  // Se descartan las alertas excluidas (beneficiario incorrecto, región
  // que no coincide o sin datos de región): no se listan ni cuentan.
  // No se borran de user_alerts: siguen en el diario persistido.
  const alerts = useMemo(
    () =>
      data.alerts
        .map((alert) => ({
          ...alert,
          decision: alert.id in overrides ? overrides[alert.id] : alert.decision,
        }))
        .filter((alert) => !isNoiseAlert(alert))
        .filter((alert) => !removedIds.has(alert.id)),
    [data.alerts, overrides, removedIds]
  );

  const summary = useMemo(() => buildTabSummary(alerts), [alerts]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  // Cerrar el modal de confirmación con Escape.
  useEffect(() => {
    if (!pendingDelete) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPendingDelete(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingDelete]);

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

  async function removeAlert(alert: AlertDTO) {
    setRemovedIds((prev) => new Set(prev).add(alert.id));

    try {
      const res = await fetch(`/api/alerts/${alert.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
    } catch {
      // Revertir el cambio optimista si la API falla.
      setRemovedIds((prev) => {
        const copy = new Set(prev);
        copy.delete(alert.id);
        return copy;
      });
    }
  }

  // El botón «Eliminar» solo abre el modal de confirmación; el borrado
  // real lo hace removeAlert al confirmar.
  function requestDelete(alert: AlertDTO) {
    setPendingDelete(alert);
  }

  function undo() {
    if (!toast) return;
    void applyDecision(toast.alert, toast.alert.decision);
    setToast(null);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }

  const inTab = alerts.filter((alert) => matchesTab(alert.decision, activeTab));

  // «Para ti» = ayudas con señal real: matched (región, keyword o
  // colectivo, o ámbito nacional con beneficiario) + maybe que la IA
  // puntuó bien (score ≥ 50). El resto de maybe va a «Quizás te interesen».
  const isForYou = (alert: AlertDTO) =>
    alert.bucket === "matched" ||
    (alert.bucket === "maybe" &&
      alert.aiStatus === "ok" &&
      (alert.score ?? 0) >= MIN_SCORE_PARA_TI);

  const forYou = inTab.filter(isForYou).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const maybe = inTab.filter((alert) => !isForYou(alert));

  return (
    <>
      {/* ── cabecera del diario ── */}
      <section className={styles.head}>
        <p className={styles.eyebrow}>Expediente</p>
        <h1 className={styles.summary}>Resumen diario de ayudas</h1>
        <p className={styles.headSub}>
          Lo nuevo de hoy entra por la pestaña «Pendientes», tú decides a dónde va.
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
                  <Card
                    key={alert.id}
                    alert={alert}
                    onTriage={applyDecision}
                    onDelete={requestDelete}
                    onDetail={setDetailAlert}
                  />
                ))}
              </ul>
            </section>
          )}

          {/* ── quizás te interesen (maybe) ── */}
          {maybe.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                Quizás te interesen{" "}
                <span className={styles.sectionCount}>{maybe.length}</span>
              </h2>
              <div className={styles.excludedCard}>
                <p className={styles.excludedRemark}>Sin señal clara</p>
                <p className={styles.excludedRemarkText}>
                  Ayudas sin una señal concreta de tu perfil, pero que podrían
                  encajar. Revisa por si acaso.
                </p>
                <ul className={styles.excludedList}>
                  {maybe.map((alert) => (
                    <li key={alert.id} className={styles.excludedRow}>
                      <div className={styles.excludedInfo}>
                        <span className={styles.excludedTitle}>
                          {alert.title}
                        </span>
                        <Regions regions={alert.impactRegions} />
                      </div>
                      <div className={styles.excludedActions}>
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
                        <Triage
                          alert={alert}
                          onTriage={applyDecision}
                          onDelete={requestDelete}
                        />
                      </div>
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
                  onDelete={requestDelete}
                  onDetail={setDetailAlert}
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

      {/* ── modal de confirmación de borrado ── */}
      {pendingDelete && (
        <ConfirmDeleteDialog
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const alert = pendingDelete;
            setPendingDelete(null);
            void removeAlert(alert);
          }}
        />
      )}

      {/* ── detalle de una ayuda (modal) ── */}
      {detailAlert && (
        <GrantDetailModal
          grantId={detailAlert.grantId}
          initial={{
            id: detailAlert.grantId,
            title: detailAlert.title,
            organization: detailAlert.organization,
            sourceUrl: detailAlert.sourceUrl,
            amount: detailAlert.amount,
            beneficiaryTypes: detailAlert.beneficiaryTypes,
            applicationStartDate: detailAlert.applicationStartDate,
            applicationEndDate: detailAlert.applicationEndDate,
            applicationStartText: detailAlert.applicationStartText,
            applicationEndText: detailAlert.applicationEndText,
            openEnded: detailAlert.openEnded,
          }}
          onClose={() => setDetailAlert(null)}
        />
      )}
    </>
  );
}

function ConfirmDeleteDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className={styles.modalOverlay}
      onClick={onCancel}
      role="presentation"
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className={styles.modalTitle} id="confirm-delete-title">
          ¿Eliminar esta ayuda?
        </h3>
        <p className={styles.modalText}>
          Esta ayuda se borrará de tu diario de decisiones. Esta acción
          no se puede deshacer.
        </p>
        <p className={styles.modalConfirm}>
          ¿Estás seguro de querer borrarla?
        </p>
        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.modalBtnCancel}
            onClick={onCancel}
            autoFocus
          >
            Cancelar
          </button>
          <button
            type="button"
            className={styles.modalBtnDanger}
            onClick={onConfirm}
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
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
  onDelete,
  onDetail,
  muted = false,
}: {
  alert: AlertDTO;
  onTriage: (alert: AlertDTO, decision: AlertDecision) => void;
  onDelete: (alert: AlertDTO) => void;
  onDetail: (alert: AlertDTO) => void;
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
      <Regions regions={alert.impactRegions} />
      <Deadline alert={alert} />
      {alert.reason && <p className={styles.cardReason}>{alert.reason}</p>}
      {!alert.reason && alert.matchReasons.length > 0 && (
        <p className={styles.cardReason}>{alert.matchReasons.join(" · ")}</p>
      )}
      <div className={styles.cardActions}>
        <div className={styles.cardLinks}>
          <button
            type="button"
            className={styles.detailBtn}
            onClick={() => onDetail(alert)}
          >
            Ver detalle →
          </button>
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
        <Triage alert={alert} onTriage={onTriage} onDelete={onDelete} />
      </div>
    </li>
  );
}

function Regions({ regions }: { regions: string[] }) {
  if (regions.length === 0) return null;
  return <p className={styles.regions}>{regions.join(" · ")}</p>;
}

type DeadlineFields = {
  applicationStartDate: string | null;
  applicationEndDate: string | null;
  applicationStartText: string | null;
  applicationEndText: string | null;
  openEnded: boolean;
};

function Deadline({ alert }: { alert: AlertDTO }) {
  // El plazo de las tarjetas sale de `eligibility_json`, que el cron guarda
  // una sola vez; a veces queda incompleto. Si faltan datos, se consulta la
  // BDNS en vivo (mismo detalle que el modal) y se muestra con fallback.
  const hasLocal = !!(
    alert.applicationStartDate ||
    alert.applicationEndDate ||
    alert.applicationStartText ||
    alert.applicationEndText ||
    alert.openEnded
  );

  const [fresh, setFresh] = useState<DeadlineFields | null>(null);

  useEffect(() => {
    if (hasLocal) return;

    let mounted = true;
    fetch(`/api/grants/${alert.grantId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!mounted || !json?.ok) return;
        const d = json.data;
        if (!d) return;
        setFresh({
          applicationStartDate: d.applicationStartDate ?? null,
          applicationEndDate: d.applicationEndDate ?? null,
          applicationStartText: d.applicationStartText ?? null,
          applicationEndText: d.applicationEndText ?? null,
          openEnded: d.openEnded === true,
        });
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [alert.grantId, hasLocal]);

  // Si no hay datos locales y el detalle fresco aún no ha llegado, no se
  // pinta nada para evitar un plazo incompleto o parpadeos.
  if (!hasLocal && !fresh) return null;

  const fields: DeadlineFields = fresh ?? {
    applicationStartDate: alert.applicationStartDate,
    applicationEndDate: alert.applicationEndDate,
    applicationStartText: alert.applicationStartText,
    applicationEndText: alert.applicationEndText,
    openEnded: alert.openEnded,
  };

  const resolved = resolveEffectiveDeadline({
    startDate: fields.applicationStartDate,
    startText: fields.applicationStartText,
    endDate: fields.applicationEndDate,
    endText: fields.applicationEndText,
    openEnded: fields.openEnded,
    publicationDate: alert.publicationDate,
  });

  const originalText = [
    fields.applicationStartText,
    fields.applicationEndText,
  ]
    .filter(Boolean)
    .join(" / ");

  const state = deadlineState(resolved.end, fields.openEnded);
  const view = deadlineView(state);

  // Nombre del plazo sin nada calculable → no hay nada que mostrar.
  if (resolved.byAnnouncement && !fields.openEnded && !originalText) return null;

  const fmt = (d: Date | null) =>
    d
      ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
      : null;

  if (resolved.byAnnouncement && !fields.openEnded) {
    if (!originalText) return null;
    return (
      <div className={styles.cardDeadline} title={originalText || undefined}>
        <span className={`${styles.deadlineBadge} ${styles.deadline_indefinido}`}>
          Plazo por anuncio
        </span>
      </div>
    );
  }

  let range: string;
  if (fields.openEnded) {
    range = "Solicitud abierta";
  } else if (resolved.end) {
    range = `${fmt(resolved.start) || "?"} → ${fmt(resolved.end)}`;
  } else {
    range = "Plazo a consultar";
  }

  return (
    <div className={styles.cardDeadline} title={originalText || undefined}>
      <span className={`${styles.deadlineBadge} ${styles[`deadline_${view.status}`]}`}>
        {view.label || "Plazo"}
      </span>
      <span className={styles.deadlineRange}>{range}</span>
      {resolved.inferred && <span className={styles.deadlineHint}>· aprox.</span>}
    </div>
  );
}

function Triage({
  alert,
  onTriage,
  onDelete,
}: {
  alert: AlertDTO;
  onTriage: (alert: AlertDTO, decision: AlertDecision) => void;
  onDelete: (alert: AlertDTO) => void;
}) {
  return (
    <div className={styles.triage} role="group" aria-label="Triaje de esta ayuda">
      {triageActionsFor(alert.decision).map((action) => {
        const className =
          action.key === "eliminar" ? styles.eliminar : styles[action.key];
        return (
          <button
            key={action.key}
            type="button"
            className={`${styles.triageBtn} ${className}`}
            onClick={() =>
              action.key === "eliminar"
                ? onDelete(alert)
                : onTriage(alert, action.key)
            }
          >
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
