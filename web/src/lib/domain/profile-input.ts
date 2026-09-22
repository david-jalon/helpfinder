/**
 * Validación y saneado de la entrada del perfil (capa pura).
 *
 * El API `/api/profile` recibe datos del navegador: nunca hay que fiarse.
 * Aquí viven las listas canónicas y las reglas, para poder testearlas sin
 * arrancar Next ni Supabase.
 */

import type { Colectivo, ProfileType, Region } from "./profile";

export const PROFILE_TYPES: readonly ProfileType[] = [
  "persona",
  "autonomo",
  "sociedad",
  "asociacion",
  "fundacion",
  "otros",
];

export const COLECTIVOS: readonly Colectivo[] = [
  "jovenes",
  "estudiantes",
  "desempleados",
  "mujeres",
  "personas_con_discapacidad",
  "mayores",
  "inmigrantes",
  "otros",
];

export const REGIONES: readonly Region[] = [
  "andaluza",
  "aragonesa",
  "asturiana",
  "balear",
  "canaria",
  "cantabrica",
  "castellano_manchega",
  "castellano_leonesa",
  "catalana",
  "extremena",
  "gallega",
  "madrileña",
  "murciana",
  "navarra",
  "vasca",
  "valenciana",
  "ceuta",
  "melilla",
];

/** Longitudes máximas de los campos de texto libre. */
export const LIMITS = {
  keywords: 300,
  contextText: 2000,
  notificationEmail: 254,
} as const;

export function isProfileType(value: unknown): value is ProfileType {
  return (
    typeof value === "string" &&
    (PROFILE_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Filtra un array a los valores válidos del catálogo, sin duplicados.
 * Descarta lo que no sea string o no esté en la lista.
 */
function sanitizeCatalog<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T[] {
  if (!Array.isArray(value)) return [];
  const allowedSet = new Set<string>(allowed);
  const out: T[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string") continue;
    if (!allowedSet.has(item) || seen.has(item)) continue;
    seen.add(item);
    out.push(item as T);
  }

  return out;
}

export function sanitizeColectivos(value: unknown): Colectivo[] {
  return sanitizeCatalog<Colectivo>(value, COLECTIVOS);
}

export function sanitizeRegiones(value: unknown): Region[] {
  return sanitizeCatalog<Region>(value, REGIONES);
}

/**
 * ¿Es una API key de Gemini con forma plausible?
 * Google las emite empezando por `AIza`. La cadena vacía es válida: sirve
 * para BORRAR la key guardada.
 */
export function isValidGeminiKey(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  return /^AIza[0-9A-Za-z_-]{20,}$/.test(trimmed);
}

/** Validación básica de email; la cadena vacía vale para borrarlo. */
export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}
