import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { enrichBacklog } from "@/lib/grants/enrich-backlog";

/**
 * Backfill de elegibilidad (Fase 3).
 *
 * GET /api/cron/enrich?limit=200&dryRun=1
 * Requiere `Authorization: Bearer <CRON_SECRET>`.
 *
 * No está en vercel.json: se llama a mano (o desde un script) para vaciar
 * el backlog de `grants_seen.enriched_at = null` sin esperar al cron diario.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "No autorizado" },
      { status: 401 }
    );
  }

  const limitRaw = Number(request.nextUrl.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 50;
  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";

  try {
    const result = await enrichBacklog(limit, dryRun);
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";

    console.error(
      JSON.stringify({
        event: "cron_enrich_error",
        error: message,
      })
    );

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
