import { NextResponse } from "next/server";
import { fetchCcaaRegionOptions } from "@/lib/bdns/regions";

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
    return NextResponse.json({ ok: true, data: result.data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Error interno",
      },
      { status: 500 }
    );
  }
}
