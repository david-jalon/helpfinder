/**
 * Filtros de búsqueda / perfiles de alerta: tipos y normalización desde JSON (API o BD).
 * Capa de dominio sin dependencias de infraestructura.
 */

export type TipoAdministracionCode = "C" | "A" | "L" | "O";

export type AlertOrderBy =
  | "numeroConvocatoria"
  | "mrr"
  | "nivel1"
  | "nivel2"
  | "nivel3"
  | "fechaRecepcion"
  | "descripcion"
  | "descripcionLeng";

export type AlertFilters = {
  searchText: string;
  tipoAdministracion: TipoAdministracionCode | null;
  regionId: number | null;
  fechaDesde: string | null;
  fechaHasta: string | null;
  orderBy: AlertOrderBy;
  direccion: "asc" | "desc";
};

export const ALLOWED_TIPO_ADMIN = ["C", "A", "L", "O"] as const;

export const ALLOWED_ORDER: readonly AlertOrderBy[] = [
  "numeroConvocatoria",
  "mrr",
  "nivel1",
  "nivel2",
  "nivel3",
  "fechaRecepcion",
  "descripcion",
  "descripcionLeng",
];

export function normalizeAlertFilters(input: unknown): AlertFilters {
  const body = (input ?? {}) as Record<string, unknown>;

  const tipoAdministracion =
    typeof body.tipoAdministracion === "string" &&
    (ALLOWED_TIPO_ADMIN as readonly string[]).includes(body.tipoAdministracion)
      ? (body.tipoAdministracion as TipoAdministracionCode)
      : null;

  const orderBy =
    typeof body.orderBy === "string" &&
    (ALLOWED_ORDER as readonly string[]).includes(body.orderBy)
      ? (body.orderBy as AlertOrderBy)
      : "fechaRecepcion";

  const direccion = body.direccion === "asc" ? "asc" : "desc";

  return {
    searchText: typeof body.searchText === "string" ? body.searchText : "",
    tipoAdministracion,
    regionId:
      typeof body.regionId === "number" && Number.isInteger(body.regionId) && body.regionId > 0
        ? body.regionId
        : null,
    fechaDesde:
      typeof body.fechaDesde === "string" && body.fechaDesde.length > 0 ? body.fechaDesde : null,
    fechaHasta:
      typeof body.fechaHasta === "string" && body.fechaHasta.length > 0 ? body.fechaHasta : null,
    orderBy,
    direccion,
  };
}
