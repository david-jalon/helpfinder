#!/usr/bin/env node
/**
 * Diagnóstico de solo lectura de Helpfinder (Fase 0).
 *
 * Uso:
 *   cd web
 *   npm run db:health
 *   npm run db:health -- --json
 *
 * Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local.
 * No escribe nada en la base. No imprime claves ni datos personales.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. " +
      "Ejecuta el script con --env-file=.env.local desde web/."
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function count(table, apply) {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (apply) query = apply(query);
  const { count: total, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return total ?? 0;
}

async function fetchAll(select, table, { pageSize = 1000, orderBy } = {}) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select(select);
    if (orderBy) query = query.order(orderBy, { ascending: true });
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

function topDuplicates(rows, field, minCount = 2) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[field];
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
}

function aggregateAlerts(rows) {
  const buckets = {};
  for (const row of rows) {
    const key = [row.bucket ?? "(null)", row.decision ?? "pendiente", row.ai_status ?? "(null)"].join(" · ");
    buckets[key] = (buckets[key] ?? 0) + 1;
  }
  return Object.entries(buckets)
    .sort((a, b) => b[1] - a[1])
    .map(([key, total]) => ({ key, total }));
}

async function main() {
  const [
    grantsTotal,
    grantsPending,
    grantsEmptyRegions,
    grantsEmptyBeneficiaries,
    grantsEnrichedButEmpty,
    grantsWithoutSeq,
    profilesTotal,
    profilesWithoutCursor,
    alertsTotal,
    grantsRows,
    alertRows,
  ] = await Promise.all([
    count("grants_seen"),
    count("grants_seen", (q) => q.is("enriched_at", null)),
    count("grants_seen", (q) => q.eq("eligibility_json->impactRegions", "[]")),
    count("grants_seen", (q) => q.eq("eligibility_json->beneficiaryTypes", "[]")),
    count("grants_seen", (q) =>
      q.not("enriched_at", "is", null).eq("eligibility_json->impactRegions", "[]")
    ),
    count("grants_seen", (q) => q.is("seq", null)),
    count("profiles"),
    count("profiles", (q) =>
      q.not("last_seen_at", "is", null).is("last_seen_seq", null)
    ),
    count("user_alerts"),
    fetchAll("first_seen_at", "grants_seen", { orderBy: "first_seen_at" }),
    fetchAll("bucket,decision,ai_status", "user_alerts", { orderBy: "created_at" }),
  ]);

  const topTimestamps = topDuplicates(grantsRows, "first_seen_at", 2);
  const alertsByState = aggregateAlerts(alertRows);

  const report = {
    generatedAt: new Date().toISOString(),
    grants: {
      total: grantsTotal,
      pendingEnrichment: grantsPending,
      emptyRegions: grantsEmptyRegions,
      emptyBeneficiaries: grantsEmptyBeneficiaries,
      enrichedButEmpty: grantsEnrichedButEmpty,
      withoutSeq: grantsWithoutSeq,
      percentEmptyRegions:
        grantsTotal === 0
          ? 0
          : Number(((grantsEmptyRegions / grantsTotal) * 100).toFixed(1)),
    },
    profiles: profilesTotal,
    profilesWithoutCursor,
    alerts: alertsTotal,
    alertsByState,
    topDuplicateFirstSeenAt: topTimestamps.map(([timestamp, count]) => ({
      timestamp,
      count,
    })),
  };

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("Helpfinder · diagnóstico de solo lectura");
  console.log("========================================");
  console.log(`Generado: ${report.generatedAt}`);
  console.log("");
  console.log(`Convocatorias totales:            ${grantsTotal}`);
  console.log(`Pendientes de enriquecer:         ${grantsPending}`);
  console.log(`Sin región (impactRegions=[]):    ${grantsEmptyRegions} (${report.grants.percentEmptyRegions}%)`);
  console.log(`Sin beneficiarios:                ${grantsEmptyBeneficiaries}`);
  console.log(`Enriquecidas pero sin región:     ${grantsEnrichedButEmpty}`);
  console.log(`Sin seq (migración):              ${grantsWithoutSeq}`);
  console.log(`Perfiles:                         ${profilesTotal}`);
  console.log(`Perfiles sin cursor:              ${profilesWithoutCursor}`);
  console.log(`Alertas:                          ${alertsTotal}`);
  console.log("");
  console.log("Alertas por estado (bucket · decisión · IA):");
  if (alertsByState.length === 0) {
    console.log("  (sin alertas)");
  } else {
    for (const row of alertsByState) {
      console.log(`  ${row.key}: ${row.total}`);
    }
  }
  console.log("");
  console.log("Timestamps de primera detección más repetidos:");
  if (topTimestamps.length === 0) {
    console.log("  (ninguno repetido)");
  } else {
    for (const [timestamp, total] of topTimestamps) {
      console.log(`  ${timestamp}: ${total} filas`);
    }
  }
  console.log("");
  console.log("Solo lectura: no se ha modificado ninguna fila.");
}

main().catch((error) => {
  console.error(`Error en el diagnóstico: ${error.message}`);
  process.exit(1);
});
