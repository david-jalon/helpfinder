import { createAdminClient } from "@/lib/supabase/admin";
import { chunkArray } from "@/lib/domain/chunk";

/**
 * Escritura de la caché pública `grants_seen`.
 *
 * Vive aparte de `daily-scan` para poder reutilizarla desde el backfill de
 * enriquecimiento sin arrastrar toda la lógica del cron.
 *
 * `enrichedIds` contiene solo los ids cuya llamada a BDNS respondió con
 * éxito. El resto se guarda con `enriched_at = null` para reintentarse.
 */

/** Filas por `upsert`. Un payload mayor puede superar el límite de PostgREST. */
const WRITE_CHUNK_SIZE = 100;

export type SeenGrantWriteInput = {
  id: string;
  title: string;
  organization: string | null;
  sourceUrl: string | null;
  publicationDate?: string | null;
  beneficiaryTypes?: string[];
  sectors?: string[];
  impactRegions?: string[];
  purpose?: string | null;
  instrumentType?: string | null;
  amount?: number | null;
  applicationStartDate?: string | null;
  applicationEndDate?: string | null;
  applicationStartText?: string | null;
  applicationEndText?: string | null;
  openEnded?: boolean;
};

/** Cuenta las filas que siguen pendientes de enriquecer. */
export async function countPendingEnrichment(): Promise<number> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("grants_seen")
    .select("*", { count: "exact", head: true })
    .is("enriched_at", null);

  if (error) throw error;
  return count ?? 0;
}

export async function upsertGrantsSeen(
  grants: SeenGrantWriteInput[],
  enrichedIds: Set<string> = new Set()
): Promise<void> {
  if (grants.length === 0) return;

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();

  const rows = grants.map((g) => ({
    num_convocatoria: g.id,
    title: g.title,
    organization: g.organization,
    source_url: g.sourceUrl,
    publication_date: g.publicationDate ?? null,
    eligibility_json: {
      beneficiaryTypes: g.beneficiaryTypes ?? [],
      sectors: g.sectors ?? [],
      impactRegions: g.impactRegions ?? [],
      purpose: g.purpose ?? null,
      instrumentType: g.instrumentType ?? null,
      amount: g.amount ?? null,
      applicationStartDate: g.applicationStartDate ?? null,
      applicationEndDate: g.applicationEndDate ?? null,
      applicationStartText: g.applicationStartText ?? null,
      applicationEndText: g.applicationEndText ?? null,
      openEnded: g.openEnded ?? false,
    },
    enriched_at: enrichedIds.has(g.id) ? nowIso : null,
  }));

  // Troceado: un `upsert` de cientos de filas puede superar el tamaño máximo
  // de petición de PostgREST. Secuencial para no saturar la base.
  for (const chunk of chunkArray(rows, WRITE_CHUNK_SIZE)) {
    const { error } = await supabase.from("grants_seen").upsert(chunk, {
      onConflict: "num_convocatoria",
      ignoreDuplicates: false,
    });

    if (error) throw error;
  }
}
