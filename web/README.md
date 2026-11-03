# web

Aplicación Next.js de Helpfinder: buscador de subvenciones de la BDNS y panel
de alertas personalizado. Guía completa del proyecto en el
[README raíz](../README.md).

## Arranque rápido

```sh
npm install
cp .env.example .env.local   # rellena Supabase, CRON_SECRET y BDNS
npm run dev
```

## Comprobaciones

```sh
npm run test        # Vitest
npx tsc --noEmit    # tipos
npm run lint        # ESLint
npm run build       # producción
```

## Rutas principales

| Ruta | Qué hace |
|---|---|
| `GET /api/grants/search` | Buscador paginado de BDNS |
| `GET /api/grants/[id]` | Detalle de una convocatoria (caché + timeout) |
| `GET /api/grants/details?ids=` | Detalles en lote (máx. 25) |
| `POST /api/dashboard` | Abre el panel: alertas nuevas + IA |
| `GET /api/dashboard` | Lee una página del diario (sin escrituras) |
| `GET/PUT/DELETE /api/alerts/[id]` | Triaje y borrado |
| `POST /api/follow` | «Seguir» desde la landing (valida en BDNS) |
| `GET /api/cron/daily` | Registro diario (Bearer `CRON_SECRET`) |
| `GET /api/cron/enrich` | Backfill manual de elegibilidad |
| `GET /api/health` | Estado y métricas (Bearer `CRON_SECRET`) |
