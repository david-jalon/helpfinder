# Helpfinder

Descubre las subvenciones y ayudas públicas que te corresponden. Buscador
gratuito sobre la BDNS (la base de datos oficial de subvenciones de España) y
panel de alertas diario ajustado a tu perfil.

## Qué hace

La web tiene dos caras. La primera es un buscador público, sin necesidad de
cuenta, que consulta las convocatorias de la BDNS: escribes lo que necesitas
("digitalización", "autónomos", "I+D") y filtras por administración, comunidad
o fechas. Cuando hay más de diez resultados puedes paginar con la barra
inferior. Cada resultado enlaza a la convocatoria original y tiene un botón
**«Ver detalle →»** que abre un modal con los datos clave de la convocatoria:
plazo de solicitud, presupuesto total y tipo de beneficiario elegible. Si
tienes sesión, también puedes pulsar **«Seguir»** en cualquier resultado para
guardarlo en tu panel sin esperar al registro diario.

La segunda es el panel personal. Te registras, describes tu perfil en español
llano (persona, autónomo, sociedad...) y cada día el dashboard te muestra las
ayudas nuevas que encajan contigo, ordenadas por relevancia. Nada de códigos
CNAE ni jerga jurídica: el sistema traduce tu descripción a los criterios de
la BDNS internamente.

Un matcher determinista decide primero qué ayudas se parecen a tu perfil. Solo
las que pasan ese filtro consumen una llamada de IA (Gemini) que puntúa y
razona cada una. Las descartadas no se guardan ni se muestran; las dudosas
("maybe") aparecen en una sección aparte, "quizás te interesen", por si
quieres revisarlas a mano.

Cada usuario usa su propia API key de Gemini. No existe una key maestra ni
etiquetado compartido, así que el servicio no depende de ninguna cuota global
y el coste de mantenerlo es cero.

Dentro del panel, el enlace con el icono de bombilla abre una guía integrada
que explica cómo funciona la página y, paso a paso, cómo crear la API key de
Gemini.

## Cómo funciona

```
BDNS (API pública)
   │
   cron diario (06:00 UTC, Vercel)
   ▼
buscar nuevas → guardar IDs y elegibilidad en grants_seen (dato público, gratis)
   │                                              │ «Seguir» desde la landing
   ▼                                              ▼
usuario entra en su panel                 guardar la ayuda en grants_seen
   │                                        + user_alerts (decision='seguir')
   ▼
1. matcher determinista: matched / maybe / excluded
2. una llamada Gemini (su key) sobre matched y maybe → score + motivo
3. diario de alertas con triaje: Seguir / Posible / Denegar
4. sección "quizás te interesen" para las dudosas (maybe)
```

El cron solo descarga los datos públicos de la BDNS (gratis). La IA se ejecuta
cuando el usuario abre su panel, con una única llamada por día. Si la cuota de
Gemini está agotada, el panel muestra las ayudas que pasaron el matcher con el
motivo de la regla; nunca se rompe.

## Stack

- **Next.js 16** (App Router) + **React 19**, TypeScript estricto.
- **Supabase** (Auth email+password y Postgres) en el plan Free.
- **Google AI Studio**: Gemini Flash, una key por usuario.
- **Vercel** para el deploy y el cron diario.
- **Vitest** para los tests.

Todo en planes gratuitos, sin coste de mantenimiento.

## Estructura del repositorio

```
helpfinder/
├─ README.md
└─ web/
   ├─ src/lib/domain/      tipos de dominio (grants, profile, alert-filters,
   │                       deadline, reltext-date)
   ├─ src/lib/bdns/        cliente de la API BDNS, detalle, regiones, urls, cache
   ├─ src/lib/matching/    matcher determinista (matched/maybe/excluded)
   ├─ src/lib/ai/          puntuación con Gemini (1 llamada batch por usuario)
   ├─ src/lib/grants/      scan diario, feed y sort de ayudas nuevas
   ├─ src/lib/dashboard/   diario de decisiones (triage, follow, run-alerts)
   ├─ src/lib/supabase/    client / server / actions de Supabase
   ├─ src/lib/db.ts        conexión a Supabase y auto-creación de tablas
   ├─ src/components/      componentes de interfaz (modal de detalle, header…)
   ├─ src/app/             páginas y rutas API (BFF)
   │  ├─ api/grants/       search (buscador paginado) y [id] (detalle)
   │  ├─ api/dashboard/    diario del panel
   │  ├─ api/alerts/       triaje y borrado de alertas
   │  ├─ api/follow/       «Seguir» desde la landing
   │  ├─ api/cron/daily/   registro diario
   │  └─ api/catalogs/     catálogos (regiones)
   ├─ src/test/            tests con Vitest
   ├─ src/proxy.ts         proxy de sesión (protege rutas privadas)
   ├─ supabase/schema.sql  esquema de base de datos
   └─ vercel.json          cron diario
```

## Configuración

Copia `web/.env.example` a `web/.env.local` y rellena los valores. Públicas
(Supabase) y solo-servidor por separado:

- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` — proyecto
  Supabase (Auth + Postgres).
- `CRON_SECRET` — protege `/api/cron/daily`; en Vercel debe coincidir con el
  secret del Cron Job.
- `BDNS_SEARCH_ENDPOINT` y `BDNS_BASE_URL` — API BDNS del Ministerio de
  Hacienda (requeridas: sin ellas fallan el buscador y el detalle de
  convocatoria, incluido el presupuesto).
- Opcionales con valores por defecto: `GEMINI_MODEL`, `AI_MAX_GRANTS_PER_CALL`,
  `CRON_SEARCH_DAYS`, `BDNS_TIMEOUT_MS`, `BDNS_RETRIES`,
  `BDNS_SEARCH_CACHE_TTL_SECONDS`.

La API key de Gemini **no** es una variable de entorno: cada usuario la
configura en su perfil (Ajustes) y se guarda por usuario, solo para servidor.

## Aviso de datos

Los datos de las convocatorias provienen de la [Base de Datos Nacional de
Subvenciones](https://www.infosubvenciones.es) (BDNS), la fuente oficial del
Ministerio de Hacienda de España. Este proyecto no tiene ninguna vinculación
con la BDNS; es un buscador y un lector de esa fuente pública.
