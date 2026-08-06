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
