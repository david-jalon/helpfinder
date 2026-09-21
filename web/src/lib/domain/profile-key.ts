/**
 * Regla pura de la API key de Gemini al guardar el perfil.
 *
 * Vive fuera del componente para poder testearla sin montar React:
 *   - Si se pide borrar            → se envía `""` (el backend la vacía).
 *   - Si se escribe una key nueva  → se envía recortada.
 *   - Si el campo está vacío       → NO se envía la clave
 *                                    (así la key guardada se conserva).
 */

export type GeminiKeyPayload = { geminiApiKey?: string };

export function resolveGeminiKeyPayload(
  input: string,
  clearRequested: boolean
): GeminiKeyPayload {
  if (clearRequested) return { geminiApiKey: "" };

  const trimmed = input.trim();
  return trimmed.length > 0 ? { geminiApiKey: trimmed } : {};
}
