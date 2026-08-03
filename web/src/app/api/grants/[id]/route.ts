import { NextRequest, NextResponse } from "next/server";
import { fetchGrantDetailByNumConv } from "@/lib/bdns/detail";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const result = await fetchGrantDetailByNumConv(id);

    if (!result.ok) {
      const status = result.status >= 400 && result.status < 600 ? result.status : 502;
      return NextResponse.json({ ok: false, error: result.message }, { status });
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
