import { NextRequest, NextResponse } from "next/server";
import { searchGrants } from "@/lib/bdns/client";

export const runtime = "nodejs";



function toPositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const q = searchParams.get("q") ?? undefined;
  const page = toPositiveInt(searchParams.get("page"), 1);
  const pageSize = toPositiveInt(searchParams.get("pageSize"), 20);
  const fechaDesde = searchParams.get("fechaDesde") ?? undefined;
  const fechaHasta = searchParams.get("fechaHasta") ?? undefined;
  const tipoAdministracion = searchParams.get("tipoAdministracion") ?? undefined;

  const orderRaw = searchParams.get("order") ?? undefined;
  const allowedOrder = [
    "numeroConvocatoria",
    "mrr",
    "nivel1",
    "nivel2",
    "nivel3",
    "fechaRecepcion",
    "descripcion",
    "descripcionLeng",
  ] as const;
  const order =
    orderRaw && (allowedOrder as readonly string[]).includes(orderRaw)
      ? orderRaw
      : undefined;

  const direccionRaw = searchParams.get("direccion");
  const direccion =
    direccionRaw === "asc" || direccionRaw === "desc"
      ? direccionRaw
      : undefined;

  const regionIdRaw = searchParams.get("regionId");
  const regionIdParsed = Number(regionIdRaw);
  const regionId =
    Number.isInteger(regionIdParsed) && regionIdParsed > 0
      ? regionIdParsed
      : undefined;

  try {
    const data = await searchGrants({
      q,
      page,
      pageSize,
      fechaDesde,
      fechaHasta,
      tipoAdministracion,
      order,
      direccion,
      regionId,
    });

    return NextResponse.json(
      {
        ok: true,
        data,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Error interno",
      },
      { status: 502 }
    );
  }
}
