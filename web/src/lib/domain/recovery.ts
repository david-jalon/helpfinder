/**
 * Lógica pura del enlace de confirmación por email (recuperar contraseña y
 * confirmar alta). Vive en `domain` porque no depende de Next ni de Supabase:
 * así se puede testear sin red.
 *
 * El email de Supabase puede llegar de dos formas:
 *  - `token_hash` + `type` (plantilla recomendada; funciona en cualquier
 *    dispositivo, porque no depende de una cookie del navegador de origen).
 *  - `code` (plantilla por defecto, flujo PKCE; depende de la cookie con el
 *    "verifier" que dejó el navegador que pidió el email).
 */

import { DEFAULT_NEXT_PATH, sanitizeNextPath } from "./redirect";

/** Ruta por defecto según el tipo de confirmación. */
export function defaultNextForType(
  type: string | null | undefined
): string {
  if (type === "recovery") return "/reset-password";
  if (type === "signup") return "/onboarding";
  return DEFAULT_NEXT_PATH;
}

export type ConfirmParams =
  | { mode: "otp"; tokenHash: string; type: string }
  | { mode: "code"; code: string; type: string | null }
  | { mode: "invalid" };

/**
 * Extrae de la query los datos necesarios para verificar el enlace.
 * Da prioridad a `token_hash` (más robusto) y si no, acepta `code`.
 *
 * En el modo `code` se guarda también el `type` (si Supabase lo incluye),
 * para poder decidir el destino aunque no venga `next`: en el plan gratis no
 * se pueden editar las plantillas, así que el enlace por defecto usa `code`.
 */
export function parseConfirmParams(params: URLSearchParams): ConfirmParams {
  const tokenHash = params.get("token_hash")?.trim();
  const type = params.get("type")?.trim();
  if (tokenHash && type) return { mode: "otp", tokenHash, type };

  const code = params.get("code")?.trim();
  if (code) return { mode: "code", code, type: type || null };

  return { mode: "invalid" };
}

/**
 * Saneado de `next` con valor de reserva: si no viene o viene vacío, se usa
 * `fallback`; si viene, se valida como ruta interna con `sanitizeNextPath`.
 */
export function sanitizeNextPathOr(
  next: string | null | undefined,
  fallback: string
): string {
  if (typeof next === "string" && next.trim().length > 0) {
    return sanitizeNextPath(next);
  }
  return fallback;
}
