/**
 * Autorización compartida de las rutas de cron.
 * Espera `Authorization: Bearer <CRON_SECRET>`.
 * Si no hay secreto configurado, rechaza siempre.
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
