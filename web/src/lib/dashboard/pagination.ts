/**
 * Paginación del diario de alertas (pura, sin dependencias de servidor).
 *
 * El diario crece con el tiempo: leerlo entero de golpe acaba truncándose en
 * silencio (PostgREST devuelve como máximo ~1000 filas). Por eso se pide por
 * páginas. Aquí se normalizan los parámetros que llegan por query string.
 */

export const DIARY_DEFAULT_LIMIT = 50;
export const DIARY_MAX_LIMIT = 100;

export type DiaryPagination = {
  page: number;
  limit: number;
  offset: number;
};

function toInt(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function parseDiaryPagination(
  pageRaw: string | null,
  limitRaw: string | null
): DiaryPagination {
  const pageParsed = toInt(pageRaw);
  const page = pageParsed !== null && pageParsed > 0 ? pageParsed : 1;

  const limitParsed = toInt(limitRaw);
  const limit =
    limitParsed !== null && limitParsed > 0
      ? Math.min(limitParsed, DIARY_MAX_LIMIT)
      : DIARY_DEFAULT_LIMIT;

  return { page, limit, offset: (page - 1) * limit };
}
