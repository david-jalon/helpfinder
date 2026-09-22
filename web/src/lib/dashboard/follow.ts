import { buildInfosubvencionesConvocatoriaUrl } from "@/lib/bdns/urls";

/**
 * Seguir una ayuda desde la landing
 *
 * Helpers PUROS para la acción «Seguir» (Fase 14): validar el payload
 * que manda el botón de la landing. Sin dependencias de servidor ni BD:
 * importable desde tests y desde el route handler.
 */

export type FollowGrantInput = {
  id: string;
  title: string;
  organization: string | null;
  sourceUrl: string | null;
};

export type FollowGrantValidation =
  | { ok: true; grant: FollowGrantInput }
  | { ok: false; error: string };

export function validateFollowGrant(raw: unknown): FollowGrantValidation {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Cuerpo inválido" };
  }

  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id.trim() : "";
  const title = typeof obj.title === "string" ? obj.title.trim() : "";

  if (!/^\d+$/.test(id)) {
    return { ok: false, error: "Número de convocatoria inválido" };
  }
  if (title.length === 0) {
    return { ok: false, error: "Falta el título de la convocatoria" };
  }
  if (title.length > 500) {
    return { ok: false, error: "El título es demasiado largo" };
  }

  const organization =
    typeof obj.organization === "string" && obj.organization.trim()
      ? obj.organization.trim().slice(0, 200)
      : null;
  const sourceUrl =
    typeof obj.sourceUrl === "string" && obj.sourceUrl.trim()
      ? obj.sourceUrl.trim().slice(0, 500)
      : null;

  return { ok: true, grant: { id, title, organization, sourceUrl } };
}

/** Datos autoritativos de BDNS (título/organismo), si se pudieron obtener. */
export type FollowGrantAuthoritative = {
  title?: string | null;
  organization?: string | null;
};

/**
 * Combina lo que manda el cliente con el detalle AUTORITATIVO de BDNS.
 *
 * - La `sourceUrl` se SIEMPRE regenera desde el id: nunca se guarda una URL
 *   del cliente (evita enlaces maliciosos en la caché compartida).
 * - Título y organismo se prefieren los de BDNS; si no llegaron, los del
 *   cliente (el id ya se validó como numérico).
 */
export function resolveFollowGrant(
  validated: FollowGrantInput,
  authoritative: FollowGrantAuthoritative | null
): FollowGrantInput {
  return {
    id: validated.id,
    title: authoritative?.title?.trim() || validated.title,
    organization: authoritative?.organization?.trim() || validated.organization,
    sourceUrl: buildInfosubvencionesConvocatoriaUrl(validated.id),
  };
}
