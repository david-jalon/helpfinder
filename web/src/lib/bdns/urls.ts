/**
 * URLs base de la API BDNS y enlaces públicos a convocatorias.
 * Centralizar aquí evita dispersar hosts oficiales por route handlers.
 */

export const DEFAULT_BDNS_API_BASE = "https://www.pap.hacienda.gob.es/bdnstrans/api";

export function getBdnsApiBase(): string {
  return (process.env.BDNS_BASE_URL ?? DEFAULT_BDNS_API_BASE).replace(/\/+$/, "");
}

export function buildInfosubvencionesConvocatoriaUrl(numeroConvocatoria: string): string {
  return `https://www.infosubvenciones.es/bdnstrans/GE/es/convocatoria/${encodeURIComponent(
    numeroConvocatoria
  )}`;
}
