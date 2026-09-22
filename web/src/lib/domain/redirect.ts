/**
 * Saneado del parámetro `next` de las páginas de acceso (capa pura).
 *
 * Tras iniciar sesión se redirige a `next`. Si se aceptara una URL externa
 * (`?next=https://sitio-malicioso`), sería una redirección abierta útil para
 * phishing. Solo se permiten rutas internas que empiecen por un único `/`.
 */

export const DEFAULT_NEXT_PATH = "/dashboard";

export function sanitizeNextPath(next: string | null | undefined): string {
  if (typeof next !== "string") return DEFAULT_NEXT_PATH;

  const trimmed = next.trim();

  // Debe ser una ruta interna absoluta: empieza por "/" pero no por "//"
  // (protocolo-relativo) ni contener "\" (que algunos navegadores tratan
  // como "/" y permitirían "\\evil.com").
  if (!trimmed.startsWith("/")) return DEFAULT_NEXT_PATH;
  if (trimmed.startsWith("//")) return DEFAULT_NEXT_PATH;
  if (trimmed.includes("\\")) return DEFAULT_NEXT_PATH;

  return trimmed;
}
