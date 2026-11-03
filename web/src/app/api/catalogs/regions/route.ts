import { NextResponse } from "next/server";
import { fetchCcaaRegionOptions } from "@/lib/bdns/regions";
import { upstreamErrorResponse } from "@/lib/http/server-errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await fetchCcaaRegionOptions();
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.message },
        { status: 502 }
      );
    }

    // La lista de CCAA cambia muy poco: se puede cachear en CDN.
    return NextResponse.json(
      { ok: true, data: result.data },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (error) {
    return upstreamErrorResponse("catalogs_regions_error", error);
  }
}
