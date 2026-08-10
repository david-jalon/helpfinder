/**
 * Matcher determinista.
 *
 * Pre-filtro GRATIS y SIN IA que decide qué ayudas encajan con el perfil
 * del usuario usando solo los campos estructurados de BDNS ya cacheados
 * en `grants_seen.eligibility_json`:
 *   - beneficiaryTypes  → quién puede pedir la ayuda (regla DURA)
 *   - impactRegions     → dónde aplica (regla DURA de exclusión + blanda)
 *   - title/purpose/sectors → búsqueda de keywords (regla BLANDA)
 *   - colectivos        → señales del perfil (jóvenes, desempleados...)
 *
 * Determinista: misma entrada → misma salida. Sin coste, sin red.
 *
 * Buckets:
 *   - matched   : pasa la regla dura y alguna señal da confianza
 *                 (región, keyword, colectivo, o ámbito nacional con
 *                 beneficiario explícito)
 *   - maybe     : pasa la dura pero sin señal clara (la IA decide)
 *   - excluded  : falla la regla dura (beneficiario) o la ayuda declara
 *                 ser de otra región → nunca gasta llamada Gemini
 *
 * El usuario escribe en español llano ("sociedad", "Madrid") y aquí se
 * traduce a tokens que existen en los datos BDNS. El usuario no ve códigos.
 */

import type { GrantItem } from "@/lib/domain/grants";
import type { Colectivo, Profile, ProfileType, Region } from "@/lib/domain/profile";

export type MatchStatus = "matched" | "maybe" | "excluded";

export type MatchResult = {
  id: string;
  status: MatchStatus;
  /** Motivos que pasaron (se muestran si la IA no está disponible). */
  reasons: string[];
  /** Regla que descartó la ayuda, o null si no se descartó. */
  rule: string | null;
};

export type MatchOutcome = {
  matched: MatchResult[];
  maybe: MatchResult[];
  excluded: MatchResult[];
};

/* ------------------------------------------------------------------ */
/*  Normalización de texto (BDNS usa acentos y mayúsculas)             */
/* ------------------------------------------------------------------ */

const ACCENT_MAP: Record<string, string> = {
  á: "a",
  é: "e",
  í: "i",
  ó: "o",
  ú: "u",
  ü: "u",
  ñ: "n",
};

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .split("")
    .map((ch) => ACCENT_MAP[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ */
/*  Traducción perfil → tokens BDNS                                    */
/* ------------------------------------------------------------------ */

/**
 * Cada tipo de perfil en español llano se traduce a tokens que suelen
 * aparecer en `tiposBeneficiarios` de BDNS.
 * "otros" no define regla dura (no sabemos su naturaleza).
 */
const PROFILE_BENEFICIARY_TOKENS: Record<ProfileType, string[]> = {
  persona: [
    "persona fisica",
    "personas fisicas",
    "persona fisica no empresaria",
    "persona fisica empresaria",
  ],
  autonomo: ["autonomo", "autonomos", "trabajador autonomo", "trabajadores autonomos"],
  sociedad: ["empresa", "empresas", "sociedad", "pyme", "pymes", "gran empresa"],
  asociacion: ["asociacion", "asociaciones", "asociativo"],
  fundacion: ["fundacion", "fundaciones", "fundacional"],
  otros: [],
};

const PROFILE_TYPE_LABEL: Record<ProfileType, string> = {
  persona: "persona particular",
  autonomo: "autónomo/a",
  sociedad: "sociedad o empresa",
  asociacion: "asociación",
  fundacion: "fundación",
  otros: "otro tipo de entidad",
};

/**
 * Cada región (adjetivo en español llano) se traduce a tokens que suelen
 * aparecer en `regiones` de BDNS (p.ej. "ES13 - Comunidad de Madrid").
 */
const REGION_TOKENS: Record<Region, string[]> = {
  andaluza: ["andalucia", "andaluz"],
  aragonesa: ["aragon"],
  asturiana: ["asturias", "asturiano"],
  balear: ["baleares", "balear", "illes"],
  canaria: ["canarias", "canaria", "gran canaria", "tenerife"],
  cantabrica: ["cantabria", "cantabrico"],
  castellano_manchega: ["castilla-la mancha", "castilla la mancha", "mancheg"],
  castellano_leonesa: ["castilla y leon", "castellano-leones"],
  catalana: ["cataluna", "catalan", "catalonia", "catalunya"],
  extremena: ["extremadura"],
  gallega: ["galicia", "gallego"],
  madrileña: ["madrid", "madrileñ"],
  murciana: ["murcia", "murciano", "region de murcia"],
  navarra: ["navarra", "navarro"],
  vasca: ["pais vasco", "euskadi", "vasco"],
  valenciana: ["valencia", "valencian", "comunitat valenciana"],
  ceuta: ["ceuta"],
  melilla: ["melilla"],
};

/**
 * Cada colectivo del perfil (persona) se traduce a tokens que suelen
 * aparecer en el título, la finalidad, los sectores o los beneficiarios.
 * Es una señal BLANDA positiva: da confianza, pero no descarta por sí sola.
 */
const COLECTIVO_TOKENS: Record<Colectivo, string[]> = {
  jovenes: [
    "joven",
    "jovenes",
    "juventud",
    "menores de 30",
    "menores de 35",
    "menor de 30",
    "menor de 35",
  ],
  estudiantes: [
    "estudiante",
    "estudiantes",
    "estudiantil",
    "alumnado",
    "alumno",
    "alumnos",
    "universitario",
    "universitarios",
    "universitaria",
    "becario",
    "becarios",
  ],
  desempleados: [
    "desempleo",
    "desemplead",
    "parados",
    "paro",
    "insercion laboral",
    "insercion sociolaboral",
    "empleabilidad",
    "reinsercion laboral",
  ],
  mujeres: [
    "mujer",
    "mujeres",
    "femenino",
    "igualdad de genero",
    "violencia de genero",
    "empoderamiento femenino",
  ],
  personas_con_discapacidad: [
    "discapacidad",
    "discapacitad",
    "diversidad funcional",
    "minusvalia",
    "accesibilidad",
  ],
  mayores: [
    "personas mayores",
    "tercera edad",
    "jubilad",
    "pensionista",
    "pensionistas",
    "envejecimiento",
    "envejecimiento activo",
    "dependencia",
    "mayores",
  ],
  inmigrantes: [
    "inmigra",
    "migrant",
    "inmigrantes",
    "extranjero",
    "extranjeros",
    "migracion",
  ],
  otros: [],
};

const COLECTIVO_LABEL: Record<Colectivo, string> = {
  jovenes: "jóvenes",
  estudiantes: "estudiantes",
  desempleados: "desempleados",
  mujeres: "mujeres",
  personas_con_discapacidad: "personas con discapacidad",
  mayores: "mayores",
  inmigrantes: "inmigrantes",
  otros: "otros colectivos",
};

/**
 * Marcadores que indican que una ayuda es de ámbito nacional (vale para
 * cualquier comunidad autónoma), aunque BDNS las liste en `regiones`.
 */
const NATIONAL_SCOPE_MARKERS = [
  "todo el mundo",
  "todas las comunidades",
  "varias comunidades",
  "todas las ccaa",
  "todas las regiones",
  "todas las autonomias",
  "todo el territorio",
  "ambito nacional",
  "territorio nacional",
  "toda espana",
  "nacional",
  "estatal",
];

/* ------------------------------------------------------------------ */
/*  Comprobaciones de reglas                                           */
/* ------------------------------------------------------------------ */

function tokensHitAny(texts: string[], tokens: string[]): boolean {
  const haystack = texts.map(normalizeText).join(" ");
  if (!haystack) return false;
  return tokens.some((token) => {
    const normalized = normalizeText(token);
    return normalized.length > 0 && haystack.includes(normalized);
  });
}

/** Regla DURA: el tipo de entidad del perfil debe estar entre los beneficiarios elegibles. */
export function matchesBeneficiary(profile: Profile, grant: GrantItem): boolean {
  const tokens = PROFILE_BENEFICIARY_TOKENS[profile.profileType];
  if (tokens.length === 0) return true;
  const beneficiaryTypes = grant.beneficiaryTypes ?? [];
  if (beneficiaryTypes.length === 0) return true;
  return tokensHitAny(beneficiaryTypes, tokens);
}

/** Regla BLANDA: la región del perfil coincide con la región de impacto de la ayuda. */
export function matchesRegion(profile: Profile, grant: GrantItem): boolean {
  const profileTokens = profile.regiones.flatMap((region) => REGION_TOKENS[region] ?? []);
  if (profileTokens.length === 0) return false;
  const impactRegions = grant.impactRegions ?? [];
  if (impactRegions.length === 0) return false;
  return tokensHitAny(impactRegions, profileTokens);
}

/** La ayuda es de ámbito nacional (no hay que exigirle región). */
export function isNationalScope(grant: GrantItem): boolean {
  const impactRegions = grant.impactRegions ?? [];
  if (impactRegions.length === 0) return true;
  const normalized = impactRegions.map(normalizeText).join(" ");
  return NATIONAL_SCOPE_MARKERS.some((m) =>
    normalized.includes(normalizeText(m))
  );
}

/**
 * Regla DURA: la ayuda declara regiones y NINGUNA es la del perfil.
 * Se excluye salvo que sea de ámbito nacional o no declare región.
 */
export function grantExcludesRegion(profile: Profile, grant: GrantItem): boolean {
  if (profile.regiones.length === 0) return false;
  const impactRegions = grant.impactRegions ?? [];
  if (impactRegions.length === 0) return false;
  if (isNationalScope(grant)) return false;
  return !matchesRegion(profile, grant);
}

/**
 * El beneficiario de la ayuda COINCIDE de forma explícita con el perfil
 * (requiere que BDNS declare datos de beneficiario). Distinto de
 * `matchesBeneficiary`, que deja pasar los datos vacíos.
 */
export function hasBeneficiaryMatch(profile: Profile, grant: GrantItem): boolean {
  const tokens = PROFILE_BENEFICIARY_TOKENS[profile.profileType];
  if (tokens.length === 0) return false;
  const beneficiaryTypes = grant.beneficiaryTypes ?? [];
  if (beneficiaryTypes.length === 0) return false;
  return tokensHitAny(beneficiaryTypes, tokens);
}

/** Regla BLANDA: un colectivo del perfil aparece en la ayuda. */
export function matchesColectivos(profile: Profile, grant: GrantItem): string | null {
  if (profile.colectivos.length === 0) return null;

  const text = [
    grant.title,
    grant.purpose ?? "",
    (grant.sectors ?? []).join(" "),
    (grant.beneficiaryTypes ?? []).join(" "),
  ]
    .map((part) => normalizeText(part ?? ""))
    .join(" ");

  for (const colectivo of profile.colectivos) {
    const tokens = COLECTIVO_TOKENS[colectivo] ?? [];
    for (const token of tokens) {
      const normalized = normalizeText(token);
      if (normalized.length > 0 && text.includes(normalized)) {
        return COLECTIVO_LABEL[colectivo];
      }
    }
  }

  return null;
}

/** Divide un texto normalizado en tokens (palabras). */
function tokensOf(normalized: string): string[] {
  return normalized.split(" ").filter((t) => t.length > 0);
}

/**
 * ¿Una secuencia de tokens aparece como subsecuencia CONSECUTIVA en el texto?
 * Se usa para keywords de varias palabras (p. ej. "I+D" → ["i","d"]), evitando
 * que un `includes` de subcadena cruce límites de palabra ("barri del" no debe
 * matchear "i d" aunque contenga la letra 'i' antes de "del").
 */
function hasConsecutiveTokens(text: string[], keyword: string[]): boolean {
  if (keyword.length === 0 || keyword.length > text.length) return false;
  for (let i = 0; i + keyword.length <= text.length; i++) {
    let hit = true;
    for (let j = 0; j < keyword.length; j++) {
      if (text[i + j] !== keyword[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}

/** Regla BLANDA: una keyword del perfil aparece en el título, la finalidad o los sectores. */
export function matchesKeywords(profile: Profile, grant: GrantItem): string | null {
  const keywords = profile.keywords
    .split(/[,;]/)
    .map((kw) => kw.trim())
    .filter((kw) => normalizeText(kw).length >= 3);

  if (keywords.length === 0) return null;

  const textTokens = [
    grant.title,
    grant.purpose ?? "",
    (grant.sectors ?? []).join(" "),
  ]
    .map((part) => normalizeText(part ?? ""))
    .map(tokensOf)
    .flat();

  for (const keyword of keywords) {
    const keywordTokens = tokensOf(normalizeText(keyword));

    // Una sola palabra: la buscamos como subcadena DENTRO de un token
    // (mantiene "digitalizacion" → "digitalizaciones"), no cruzando palabras.
    if (keywordTokens.length === 1) {
      if (textTokens.some((token) => token.includes(keywordTokens[0]))) {
        return keyword.trim();
      }
      continue;
    }

    // Varias palabras: deben aparecer como tokens consecutivos exactos.
    if (hasConsecutiveTokens(textTokens, keywordTokens)) {
      return keyword.trim();
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Clasificación final                                                */
/* ------------------------------------------------------------------ */

export function matchGrant(profile: Profile, grant: GrantItem): MatchResult {
  const reasons: string[] = [];

  // Regla dura: tipo de beneficiario.
  const beneficiaryOk = matchesBeneficiary(profile, grant);
  if (!beneficiaryOk) {
    return {
      id: grant.id,
      status: "excluded",
      reasons,
      rule: "beneficiario",
    };
  }

  // Regla dura: si la ayuda declara ser de otra región, se descarta.
  if (grantExcludesRegion(profile, grant)) {
    return {
      id: grant.id,
      status: "excluded",
      reasons,
      rule: "region",
    };
  }

  reasons.push(`La ayuda acepta tu perfil (${PROFILE_TYPE_LABEL[profile.profileType]})`);

  // Reglas blandas: región, keywords y colectivos.
  const regionHit = matchesRegion(profile, grant);
  if (regionHit) reasons.push("Coincide con tu región");

  const keywordHit = matchesKeywords(profile, grant);
  if (keywordHit) reasons.push(`Coincide tu palabra clave «${keywordHit}»`);

  const colectivoHit = matchesColectivos(profile, grant);
  if (colectivoHit) reasons.push(`Coincide tu colectivo (${colectivoHit})`);

  // Una ayuda de ámbito nacional con beneficiario explícito también vale
  // para ti, aunque no coincida la región.
  const nationalScope = isNationalScope(grant);
  const strongBeneficiary = hasBeneficiaryMatch(profile, grant);
  const recommendable =
    regionHit ||
    keywordHit ||
    colectivoHit ||
    (nationalScope && strongBeneficiary);

  const status: MatchStatus = recommendable ? "matched" : "maybe";

  return { id: grant.id, status, reasons, rule: null };
}

export function matchGrants(profile: Profile, grants: GrantItem[]): MatchOutcome {
  const outcome: MatchOutcome = { matched: [], maybe: [], excluded: [] };

  for (const grant of grants) {
    const result = matchGrant(profile, grant);
    outcome[result.status].push(result);
  }

  return outcome;
}
