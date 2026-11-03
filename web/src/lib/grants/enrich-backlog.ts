import { enrichGrantsWithEligibility } from "@/lib/bdns/detail";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  countPendingEnrichment,
  upsertGrantsSeen,
  type SeenGrantWriteInput,
} from "./seen-write";

/**
 * Backfill controlado de elegibilidad.
 *
 * Procesa como máximo `limit` filas con `enriched_at = null`, en orden de
 * `seq` (cronológico). Solo escribe las que BDNS respondió bien; las que
 * fallan siguen pendientes para la siguiente llamada.
 *
 * Se usa desde `/api/cron/enrich` (protegido por CRON_SECRET) para vaciar
 * el backlog sin esperar al límite diario del cron.
 */

export type EnrichBacklogResult = {
  processed: number;
  succeeded: number;
  failed: number;
  remaining: number;
  dryRun: boolean;
};

const MAX_LIMIT = 200;

export async function enrichBacklog(
  limit = 50,
  dryRun = false
): Promise<EnrichBacklogResult> {
  const safeLimit = Math.min(
    MAX_LIMIT,
    Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 50))
  );

  const remainingBefore = await countPendingEnrichment();

  if (dryRun) {
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      remaining: remainingBefore,
      dryRun: true,
    };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("grants_seen")
    .select("*")
    .is("enriched_at", null)
    .order("seq", { ascending: true })
    .limit(safeLimit);

  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) {
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      remaining: 0,
      dryRun: false,
    };
  }

  const items: SeenGrantWriteInput[] = rows.map((row) => ({
    id: String(row.num_convocatoria),
    title: String(row.title ?? ""),
    organization: row.organization ? String(row.organization) : null,
    sourceUrl: row.source_url ? String(row.source_url) : null,
    publicationDate: row.publication_date ? String(row.publication_date) : null,
  }));

  const { succeeded } = await enrichGrantsWithEligibility(items);

  if (succeeded.size > 0) {
    await upsertGrantsSeen(
      items.filter((item) => succeeded.has(item.id)),
      succeeded
    );
  }

  const remaining = await countPendingEnrichment();

  return {
    processed: items.length,
    succeeded: succeeded.size,
    failed: items.length - succeeded.size,
    remaining,
    dryRun: false,
  };
}
