import { NextResponse } from "next/server";

/**
 * Errores de servidor: el detalle se queda en el log y el cliente recibe un
 * mensaje genérico. Nunca devolvemos `error.message` de Supabase/Next al
 * navegador.
 */
export function logServerError(event: string, error: unknown): void {
  console.error(
    JSON.stringify({
      event,
      detail: error instanceof Error ? error.message : String(error),
    })
  );
}

export function internalErrorResponse(
  event: string,
  error: unknown
): NextResponse {
  logServerError(event, error);
  return NextResponse.json(
    { ok: false, error: "Error interno. Inténtalo de nuevo." },
    { status: 500 }
  );
}

export function upstreamErrorResponse(
  event: string,
  error: unknown
): NextResponse {
  logServerError(event, error);
  return NextResponse.json(
    { ok: false, error: "No se pudo consultar el servicio externo. Inténtalo de nuevo." },
    { status: 502 }
  );
}
