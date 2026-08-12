"use client";

import { useEffect, useState } from "react";
import type { GrantDetail } from "@/lib/domain/grants";
import { deadlineState, deadlineView, resolveEffectiveDeadline } from "@/lib/domain/deadline";
import styles from "./grant-detail-modal.module.css";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; grant: Partial<GrantDetail> };

/**
 * Modal de detalle de una convocatoria.
 * - Recibe `grantId` y lo muestra en un overlay.
 * - Pide datos FRESCOS a `GET /api/grants/[id]` cada vez que se abre.
 * - `initial` es opcional: si la tarjeta ya tiene datos (Landing/Dashboard)
 *   se muestran al instante mientras llega el detalle completo de BDNS.
 * - Cierra con Escape o clic en el fondo.
 */
export default function GrantDetailModal({
  grantId,
  initial,
  onClose,
}: {
  grantId: string;
  initial?: Partial<GrantDetail> | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<LoadState>(
    initial?.title ? { kind: "ready", grant: initial } : { kind: "loading" }
  );

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const res = await fetch(`/api/grants/${grantId}`, { cache: "no-store" });
        const json = (await res.json()) as {
          ok: boolean;
          error?: string;
          data?: GrantDetail;
        };
        if (mounted) {
          if (!res.ok || !json.ok || !json.data) {
            setState({ kind: "error", message: json.error ?? "No se pudo cargar la ayuda" });
          } else {
            setState({ kind: "ready", grant: json.data });
          }        }
      } catch {
        if (mounted) {
          setState({ kind: "error", message: "No se pudo conectar con el servidor" });
        }
      }
    }

    void load();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      mounted = false;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [grantId, onClose]);

  const grant = state.kind === "ready" ? state.grant : initial;

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="grant-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className={styles.close} type="button" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>

        {state.kind === "loading" && !grant && (
          <p className={styles.center}>Cargando ayuda…</p>
        )}

        {state.kind === "error" && (
          <p className={styles.center}>Error: {state.message}</p>
        )}

        {grant && (
          <>
            <p className={styles.ref}>nº convocatoria {grant.id}</p>
            <h2 className={styles.title} id="grant-detail-title">
              {grant.title}
            </h2>
            {grant.organization && <p className={styles.org}>{grant.organization}</p>}
            {grant.publicationDate && (
              <p className={styles.meta}>Publicada · {grant.publicationDate}</p>
            )}

            <DeadlineBlock grant={grant} />

            <KeyDataBlock grant={grant} />

            {grant.description && (
              <p className={styles.description}>{grant.description}</p>
            )}

            <div className={styles.actions}>
              {grant.sourceUrl && (
                <a
                  className={styles.link}
                  href={grant.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ver convocatoria en BDNS →
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function formatAmount(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}

function KeyDataBlock({ grant }: { grant: Partial<GrantDetail> }) {
  const amount = formatAmount(grant.amount);
  const beneficiaries = grant.beneficiaryTypes ?? [];

  if (!amount && beneficiaries.length === 0) return null;

  return (
    <section className={styles.datos} aria-label="Datos clave de la convocatoria">
      <p className={styles.datosEyebrow}>Datos clave</p>
      <div className={styles.datosGrid}>
        {amount && (
          <div className={styles.datosItem}>
            <span className={styles.datosLabel}>Presupuesto de la convocatoria</span>
            <span className={styles.datosValue}>{amount}</span>
          </div>
        )}
        {beneficiaries.length > 0 && (
          <div className={styles.datosItem}>
            <span className={styles.datosLabel}>Beneficiario elegible</span>
            <div className={styles.chips}>
              {beneficiaries.map((b) => (
                <span className={styles.chip} key={b}>{b}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function DeadlineBlock({ grant }: { grant: Partial<GrantDetail> }) {
  const resolved = resolveEffectiveDeadline({
    startDate: grant.applicationStartDate,
    startText: grant.applicationStartText,
    endDate: grant.applicationEndDate,
    endText: grant.applicationEndText,
    openEnded: grant.openEnded,
    publicationDate: grant.publicationDate,
  });

  const state = deadlineState(resolved.end, grant.openEnded);
  const view = deadlineView(state);

  const fmtLong = (d: Date | null) =>
    d
      ? d.toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : null;

  const startText = grant.applicationStartText;
  const endText = grant.applicationEndText;

  const hasAny =
    resolved.start || resolved.end || startText || endText || grant.openEnded;
  if (!hasAny) return null;

  const renderedStart =
    grant.applicationStartDate || resolved.start
      ? fmtLong(resolved.start)
      : startText;
  const renderedEnd = grant.openEnded
    ? "Sin fecha de cierre"
    : grant.applicationEndDate || resolved.end
      ? fmtLong(resolved.end)
      : endText;

  return (
    <section className={styles.plazo} aria-label="Plazo de solicitud">
      <p className={styles.plazoEyebrow}>Plazo de solicitud</p>

      {state.kind !== "sin-plazo" && (
        <span className={`${styles.badge} ${styles[`badge_${view.status}`]}`}>
          {view.label || "Plazo"}
        </span>
      )}

      <div className={styles.plazoGrid}>
        <div className={styles.plazoItem}>
          <span className={styles.plazoLabel}>Inicio</span>
          <span className={styles.plazoValue}>{renderedStart}</span>
          {!resolved.start && startText && <span className={styles.plazoSub}>{startText}</span>}
        </div>
        <div className={styles.plazoItem}>
          <span className={styles.plazoLabel}>Fin</span>
          <span className={styles.plazoValue}>{renderedEnd}</span>
          {!resolved.end && endText && grant.openEnded !== true && (
            <span className={styles.plazoSub}>{endText}</span>
          )}
        </div>
      </div>
    </section>
  );
}
