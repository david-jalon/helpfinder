#!/usr/bin/env node
/**
 * Backfill de elegibilidad de BDNS (Fase 3).
 *
 * Llama a `/api/cron/enrich` en lotes. El servidor debe estar arrancado
 * (`next start` o `next dev`) o se puede apuntar a producción.
 *
 * Uso local:
 *   cd web
 *   npm run backfill:eligibility
 *
 * Contra producción:
 *   $env:BACKFILL_BASE_URL="https://helpfinder-theta.vercel.app"
 *   npm run backfill:eligibility
 *
 * Variables opcionales:
 *   BACKFILL_LIMIT=200        filas por lote (máx. 200 en la ruta)
 *   BACKFILL_MAX_BATCHES=100  tope de lotes
 *   BACKFILL_DRY_RUN=1        solo cuenta, no llama a BDNS
 */

const baseUrl = (process.env.BACKFILL_BASE_URL ?? "http://localhost:3100").replace(/\/+$/, "");
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error("Falta CRON_SECRET en el entorno.");
  process.exit(1);
}

const limit = Number(process.env.BACKFILL_LIMIT ?? "200");
const maxBatches = Number(process.env.BACKFILL_MAX_BATCHES ?? "100");
const dryRun = process.env.BACKFILL_DRY_RUN === "1";

async function main() {
  console.log(`Backfill ${dryRun ? "(dry-run) " : ""}→ ${baseUrl}`);
  console.log(`Lotes: máx. ${maxBatches}, límite por lote: ${limit}`);

  let previousRemaining = Number.POSITIVE_INFINITY;

  for (let batch = 1; batch <= maxBatches; batch += 1) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (dryRun) params.set("dryRun", "1");

    const response = await fetch(`${baseUrl}/api/cron/enrich?${params}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });

    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.ok) {
      console.error(`Lote ${batch}: error HTTP ${response.status}`);
      console.error(json ?? "(respuesta no JSON)");
      process.exitCode = 1;
      return;
    }

    const data = json.data;
    console.log(
      `Lote ${batch}: procesadas=${data.processed} ok=${data.succeeded} fallidas=${data.failed} pendientes=${data.remaining}`
    );

    if (data.remaining === 0 || data.processed === 0) {
      console.log("Backfill completado.");
      return;
    }

    if (data.remaining >= previousRemaining) {
      console.warn("El backlog no baja; se detiene para no repetir en bucle.");
      process.exitCode = 1;
      return;
    }
    previousRemaining = data.remaining;
  }

  console.log(`Tope de ${maxBatches} lotes alcanzado; quedan pendientes.`);
}

main().catch((error) => {
  console.error(`Error en el backfill: ${error.message}`);
  process.exitCode = 1;
});
