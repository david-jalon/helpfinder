import { NextRequest, NextResponse } from "next/server";
import { dailyScan } from "@/lib/grants/daily-scan";

/**
 * Cron diario — Fase 9
 *
 * Vercel Cron llama a esta ruta una vez al día (configurado en vercel.json).
 * Verifica un header secreto para que nadie más pueda ejecutarla.
 *
 * Flujo:
 *  1. Verificar autorización (header `Authorization: Bearer <CRON_SECRET>`)
 *  2. Ejecutar `dailyScan()`: buscar BDNS, detectar nuevas, guardar
 *  3. Devolver resumen JSON
 */

export const runtime = "nodejs";

function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    // Sin secret configurado: rechazar siempre (seguridad por defecto)
    return false;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json(
      { ok: false, error: "No autorizado" },
      { status: 401 }
    );
  }

  try {
    const result = await dailyScan();

    console.info(
      JSON.stringify({
        event: "cron_daily_completed",
        totalFetched: result.totalFetched,
        newGrantsCount: result.newGrantsCount,
        enrichedCount: result.enrichedCount,
      })
    );

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";

    console.error(
      JSON.stringify({
        event: "cron_daily_error",
        error: message,
      })
    );

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
