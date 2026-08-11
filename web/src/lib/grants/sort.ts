import type { GrantItem } from "@/lib/domain/grants";

/**
 * Orden local (sin BDNS) de resultados ya cargados.
 * Se usa en la landing para que cambiar "Ordenar por" / "Dirección" no
 * vuelva a llamar a la API: reordena solo lo que ya está en pantalla.
 */

function parseBdnsDate(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
}

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Compara dos textos ordenando al final los valores ausentes (null),
 * en cualquiera de las dos direcciones.
 */
function compareText(a: string | null, b: string | null, dir: number): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b, "es") * dir;
}

function compareDate(a: number | null, b: number | null, dir: number): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * dir;
}

export function sortResults(
  items: GrantItem[],
  order: string,
  direccion: "asc" | "desc"
): GrantItem[] {
  const dir = direccion === "asc" ? 1 : -1;
  const copy = [...items];

  switch (order) {
    case "fechaRecepcion":
      copy.sort((a, b) =>
        compareDate(
          parseBdnsDate(a.publicationDate),
          parseBdnsDate(b.publicationDate),
          dir
        )
      );
      break;
    case "numeroConvocatoria":
      copy.sort((a, b) => (toNumber(a.id) - toNumber(b.id)) * dir);
      break;
    case "nivel2":
      copy.sort((a, b) => compareText(a.organization, b.organization, dir));
      break;
    case "descripcion":
      copy.sort((a, b) => compareText(a.title, b.title, dir));
      break;
    default:
      // Orden desconocido → se conserva el orden en el que llegaron.
      break;
  }

  return copy;
}