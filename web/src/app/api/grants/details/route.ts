import { NextRequest, NextResponse } from "next/server";
import { fetchGrantDetailByNumConv } from "@/lib/bdns/detail";
import type { GrantDetail } from "@/lib/domain/grants";
import { internalErrorResponse } from "@/lib/http/server-errors";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Detalles de varias convocatorias en una sola petición.
 *
 * GET /api/grants/details?ids=123,456,789
 *
 * Existe para que el dashboard no haga un N+1: antes cada tarjeta sin plazo
 * en `eligibility_json` pedía su propio `/api/grants/[id]`. Aquí se piden
 * todos los que faltan de una vez.
 *
 * - Máximo 25 ids por petición (una llamada a BDNS por id).
 * - Concurrencia 3: el scheduler de BDNS ya limita el ritmo global.
 * - Un id que falla se devuelve como `null`; el resto sigue.
 */
const MAX_IDS = 25;
const CONCURRENCY = 3;

function parseIds(raw: string | null): string[] {
  if (!raw) return [];

  const unique = new Set<string>();
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (/^\d+$/.test(id)) unique.add(id);
    if (unique.size >= MAX_IDS) break;
  }

  return [...unique];
}

async function fetchAll(
  ids: string[]
): Promise<Record<string, GrantDetail | null>> {
  const out: Record<string, GrantDetail | null> = {};
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      const result = await fetchGrantDetailByNumConv(id);
      out[id] = result.ok ? result.data : null;
    }
  }

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, ids.length) },
    () => worker()
  );
  await Promise.all(workers);

  return out;
}

export async function GET(request: NextRequest) {
  try {
    const ids = parseIds(request.nextUrl.searchParams.get("ids"));

    if (ids.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Faltan ids válidos" },
        { status: 400 }
      );
    }

    const data = await fetchAll(ids);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return internalErrorResponse("grants_details_error", error);
  }
}
