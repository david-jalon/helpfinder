/**
 * Utilidad pura para partir una lista en trozos.
 *
 * Se usa al pedir muchas convocatorias por id a Supabase: un `.in([...])`
 * con cientos de ids puede superar el tamaño máximo de URL. Partiendo en
 * trozos de 100 y uniendo los resultados, se evita ese límite.
 */

export function chunkArray<T>(items: T[], size: number): T[][] {
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("chunkArray: el tamaño del trozo debe ser mayor que 0");
  }

  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
