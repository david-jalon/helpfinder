import { createClient } from "@/lib/supabase/server";

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
 */
export async function getGrantsSeenByIds(ids: string[]): Promise<SeenGrant[]> {
  if (ids.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grants_seen")
    .select("*")
    .in("num_convocatoria", ids);

  if (error) throw error;
  return (data ?? []).map(rowToSeenGrant);
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
 * Devuelve las ayudas NUEVAS desde la última visita del usuario.
 * - `sinceIso` null (primera visita): las más recientes de grants_seen.
 * - `sinceIso` con fecha: solo las detectadas DESPUÉS de esa fecha
 *   (la "marca de agua" la escribe el dashboard en `profiles.last_seen_at`).
 */
export async function getGrantsSeenSince(
  sinceIso: string | null,
  limit = 50
): Promise<SeenGrant[]> {
  const supabase = await createClient();

  let query = supabase
    .from("grants_seen")
    .select("*")
    .order("first_seen_at", { ascending: false })
    .limit(limit);

  if (sinceIso) {
    query = query.gt("first_seen_at", sinceIso);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []).map(rowToSeenGrant);
}
