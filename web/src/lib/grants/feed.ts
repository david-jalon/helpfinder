import { createClient } from "@/lib/supabase/server";

/**
 * Feed de ayudas (Fase 9).
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
