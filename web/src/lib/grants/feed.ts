import { createClient } from "@/lib/supabase/server";
import { chunkArray } from "@/lib/domain/chunk";

/**
 * Feed de ayudas (BDNS).
 *
 * Lee la tabla `grants_seen` (caché pública compartida) para
 * mostrar ayudas recientes en el dashboard o en la landing.
 *
 * Esta tabla la escribe el cron diario; aquí solo leemos.
 */

export type SeenGrant = {
  numConvocatoria: string;
  title: string;
  organization: string | null;
  sourceUrl: string | null;
  publicationDate: string | null;
  firstSeenAt: string;
  eligibilityJson: Record<string, unknown> | null;
  enrichedAt: string | null;
};

function rowToSeenGrant(row: Record<string, unknown>): SeenGrant {
  return {
    numConvocatoria: String(row.num_convocatoria),
    title: String(row.title ?? ""),
    organization: row.organization ? String(row.organization) : null,
    sourceUrl: row.source_url ? String(row.source_url) : null,
    publicationDate: row.publication_date ? String(row.publication_date) : null,
    firstSeenAt: String(row.first_seen_at ?? ""),
    eligibilityJson: (row.eligibility_json as Record<string, unknown>) ?? null,
    enrichedAt: row.enriched_at ? String(row.enriched_at) : null,
  };
}

/**
 * Devuelve las ayudas más recientes de grants_seen.
 * Útil para el dashboard y la landing ("últimas ayudas detectadas").
 */
export async function getRecentGrants(limit = 20): Promise<SeenGrant[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grants_seen")
    .select("*")
    .order("first_seen_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(rowToSeenGrant);
}

/**
 * Devuelve una ayuda específica por su num_convocatoria.
 */
export async function getGrantByNumConv(
  numConvocatoria: string
): Promise<SeenGrant | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grants_seen")
    .select("*")
    .eq("num_convocatoria", numConvocatoria)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToSeenGrant(data) : null;
}

/**
 * Devuelve varias ayudas por sus num_convocatoria.
 * Se usa para completar título/organización/enlace de las alertas
 * persistidas en `user_alerts` al recargar el dashboard.
 *
 * Los ids se piden en trozos de 100: un `.in()` con cientos de ids podría
 * superar el tamaño máximo de URL de Supabase/PostgREST.
 */
export async function getGrantsSeenByIds(ids: string[]): Promise<SeenGrant[]> {
  if (ids.length === 0) return [];

  const supabase = await createClient();
  const chunks = chunkArray([...new Set(ids)], 100);

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const { data, error } = await supabase
        .from("grants_seen")
        .select("*")
        .in("num_convocatoria", chunk);

      if (error) throw error;
      return data ?? [];
    })
  );

  return results.flat().map(rowToSeenGrant);
}

/**
 * Cuenta cuántas ayudas hay en grants_seen.
 */
export async function countGrantsSeen(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("grants_seen")
    .select("*", { count: "exact", head: true });

  if (error) throw error;
  return count ?? 0;
}

/**
 * Ayudas cuya elegibilidad quedó PENDIENTE: el enriquecimiento falló
 * (timeout, red) y `enriched_at` se quedó a null. El cron las reintenta, de
 * la más antigua a la más nueva, para que una caída puntual de BDNS no deje
 * una ayuda sin región/beneficiario para siempre.
 */
export async function getGrantsNeedingEnrichment(
  limit = 50
): Promise<SeenGrant[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grants_seen")
    .select("*")
    .is("enriched_at", null)
    .order("first_seen_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(rowToSeenGrant);
}

/**
 * Devuelve las ayudas NUEVAS desde la última visita del usuario, de la más
 * ANTIGUA a la más reciente.
 *
 * El orden ascendente es clave: al abrir el panel se procesan desde la marca
 * de agua hacia delante. Si hay más nuevas que `limit`, se procesan primero
 * las más antiguas y la marca de agua avanza solo hasta lo realmente
 * procesado, de modo que las siguientes se recogen en la próxima pasada.
 * (Antes se tomaban las `limit` más recientes y las anteriores se perdían.)
 *
 * `sinceIso` es la marca de agua (`profiles.last_seen_at`) y NO puede ser
 * null: para la PRIMERA visita usa `getRecentGrants` (las más recientes).
 */
export async function getGrantsSeenSince(
  sinceIso: string,
  limit = 50
): Promise<SeenGrant[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("grants_seen")
    .select("*")
    .gt("first_seen_at", sinceIso)
    .order("first_seen_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(rowToSeenGrant);
}
