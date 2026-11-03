import { NextRequest, NextResponse } from "next/server";
import { fetchGrantDetailByNumConv } from "@/lib/bdns/detail";
import { internalErrorResponse } from "@/lib/http/server-errors";

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
    return internalErrorResponse("grant_detail_error", error);
  }
}
