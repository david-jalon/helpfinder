/**
 * Inferencia de fechas a partir de textos referenciales de plazo que BDNS
 * deja como texto (p.ej. "DÍA SIGUIENTE DE SU PUBLICACIÓN", "DIEZ DÍAS
 * DESPUÉS DE SU PUBLICACIÓN") en lugar de una fecha concreta.
 *
 * Estrategia: reconocer el desplazamiento temporal descrito por el texto y
 * aplicarlo sobre la fecha de publicación de la convocatoria. Solo se infiere
 * cuando el patrón es reconocible; si no, se devuelve `null` (fallback a texto).
 *
 * Capa de dominio pura (sin deps de infraestructura).
 */

const DIAS_MINUSCULA: Record<string, number> = {
  UNO: 1,
  DOS: 2,
  TRES: 3,
  CUATRO: 4,
  CINCO: 5,
  SEIS: 6,
  SIETE: 7,
  OCHO: 8,
  NUEVE: 9,
  DIEZ: 10,
  ONCE: 11,
  DOCE: 12,
  TRECE: 13,
  CATORCE: 14,
  QUINCE: 15,
  DIECISEIS: 16,
  DIECISIETE: 17,
  DIECIOCHO: 18,
  DIECINUEVE: 19,
  VEINTE: 20,
  TREINTA: 30,
  SESENTA: 60,
  NOVENTA: 90,
};

const MESES_MINUSCULA: Record<string, number> = {
  UNO: 1,
  DOS: 2,
  TRES: 3,
  CUATRO: 4,
  CINCO: 5,
  SEIS: 6,
  SIETE: 7,
  OCHO: 8,
  NUEVE: 9,
  DIEZ: 10,
  ONCE: 11,
  DOCE: 12,
};

/**
 * Normaliza a mayúsculas sin acentos y espacios colapsados para un matching
 * robusto (BDNS suele venir en mayúsculas y con/sin tildes).
 */
function normalize(value: string): string {
  return value
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumberWord(word: string, map: Record<string, number>): number | null {
  if (!word) return null;
  word = normalize(word);
  if (/^\d+$/.test(word)) {
    const n = Number(word);
    return Number.isFinite(n) ? n : null;
  }
  return map[word] ?? null;
}

/**
 * Lee un "número" al principio de una frase, ya sea en cifras o en letra
 * (compuestas tipo "DIEZ Y SIETE"). Devuelve el valor numérico.
 */
function readAmount(text: string, map: Record<string, number>): number | null {
  const numMatch = text.match(/^(\d+)\s*/);
  if (numMatch) {
    const n = Number(numMatch[1]);
    if (Number.isFinite(n)) return n;
  }

  // Compuestas: "DIEZ Y SIETE" | "DIEZ Y SIETE" o "VEINTIUNO"...
  const compound = text.match(
    /^(DIEZ|VEINTE|TREINTA|CUARENTA|CINCUENTA|SESENTA|SETENTA|OCHENTA|NOVENTA)\s*(Y\s*)?([A-Z]+)\b/i
  );
  if (compound) {
    const tens = map[normalize(compound[1])];
    const units = map[normalize(compound[3])];
    if (typeof tens === "number" && typeof units === "number") return tens + units;
  }

  const single = text.match(/^([A-Z]+)/i);
  if (single) {
    const n = parseNumberWord(single[1], map);
    if (n !== null) return n;
  }
  return null;
}

export type DayOffset =
  | { kind: "days"; value: number }
  | { kind: "months"; value: number };

/**
 * Intenta resolver el desplazamiento temporal (en días o meses) descrito por
 * el texto. Devuelve null si el patrón no es reconocible.
 */
export function resolveDayOffset(text: string | null | undefined): DayOffset | null {
  if (typeof text !== "string") return null;
  const t = normalize(text);
  if (!t) return null;

  // "DÍA SIGUIENTE" / "AL DÍA SIGUIENTE" → +1 día
  if (/^DIA\s+SIGUIENTE/.test(t) || /AL\s+DIA\s+SIGUIENTE/.test(t)) {
    return { kind: "days", value: 1 };
  }

  // "N DÍAS DESPUÉS ..."
  const dias = t.match(/^(\d+|[A-Z][A-Z\s]*?)\s+DIAS?\s+DESPUES/);
  if (dias) {
    const n = readAmount(dias[1], DIAS_MINUSCULA);
    if (n !== null) return { kind: "days", value: n };
  }

  // "N MESES ..."
  const meses = t.match(/^(\d+|[A-Z][A-Z\s]*?)\s+MES(?:ES)?\s+(?:DESPUES|TRAS|A\s+PARTIR|AL\s+SIGUIENTE)/);
  if (meses) {
    const n = readAmount(meses[1], MESES_MINUSCULA);
    if (n !== null) return { kind: "months", value: n };
  }

  // "A PARTIR DE LA PUBLICACIÓN" / "DESDE LA PUBLICACIÓN" / "DESDE SU PUBLICACIÓN" → +0
  if (/^(A\s+PARTIR\s+DE|DESDE)/.test(t)) {
    return { kind: "days", value: 0 };
  }

  return null;
}

/**
 * Aplica un desplazamiento (días o meses) a una fecha.
 */
function addOffset(date: Date, offset: DayOffset): Date {
  const result = new Date(date);
  if (offset.kind === "days") {
    result.setDate(result.getDate() + offset.value);
  } else {
    result.setMonth(result.getMonth() + offset.value);
  }
  return result;
}

/**
 * Infiere una fecha a partir de texto referencial y la fecha de publicación.
 * Devuelve null si el texto no es reconocible o falta la fecha base.
 */
export function inferDateFromPublicationText(
  text: string | null | undefined,
  publicationDate: Date | null
): Date | null {
  if (!publicationDate) return null;
  const offset = resolveDayOffset(text);
  if (!offset) return null;
  return addOffset(publicationDate, offset);
}
