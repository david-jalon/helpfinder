"use client";

import { useEffect, useState } from "react";
import type { GrantDetail } from "@/lib/domain/grants";
import { deadlineState, deadlineView, parseAppDate } from "@/lib/domain/deadline";
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

function DeadlineBlock({ grant }: { grant: Partial<GrantDetail> }) {
  const state = deadlineState(grant.applicationEndDate, grant.openEnded);
  const view = deadlineView(state);

  const fmt = (value: string | null | undefined) =>
    parseAppDate(value)
      ? parseAppDate(value)!.toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : null;

  const startDate = fmt(grant.applicationStartDate);
  const endDate = fmt(grant.applicationEndDate);
  const startText = grant.applicationStartText;
  const endText = grant.applicationEndText;

  const hasAny = grant.applicationStartDate || grant.applicationEndDate || startText || endText || grant.openEnded;
  if (!hasAny) return null;

  const startLabel = startDate ?? startText ?? "—";
  const endLabel = grant.openEnded
    ? "Sin fecha de cierre"
    : endDate ?? endText ?? "—";

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
          <span className={styles.plazoValue}>{startLabel}</span>
        </div>
        <div className={styles.plazoItem}>
          <span className={styles.plazoLabel}>Fin</span>
          <span className={styles.plazoValue}>{endLabel}</span>
        </div>
      </div>
    </section>
  );
}
