# Helpfinder

Descubre las subvenciones y ayudas públicas que te corresponden. Buscador
gratuito sobre la BDNS (la base de datos oficial de subvenciones de España) y
panel de alertas diario ajustado a tu perfil.

## Qué hace

La web tiene dos caras. La primera es un buscador público, sin necesidad de
cuenta, que consulta las convocatorias de la BDNS: escribes lo que necesitas
("digitalización", "autónomos", "I+D") y filtras por administración, comunidad
o fechas. Cada resultado enlaza a la convocatoria original.

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
   │
   usuario entra en su panel
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
   ├─ src/lib/domain/     tipos de dominio (grants, profile, alert-filters)
   ├─ src/lib/bdns/       cliente de la API BDNS, detalle, regiones, cache
   ├─ src/lib/matching/   matcher determinista (matched/maybe/excluded)
   ├─ src/lib/ai/         puntuación con Gemini (1 llamada batch por usuario)
   ├─ src/lib/grants/     scan diario y feed de ayudas nuevas
   ├─ src/lib/db.ts       conexión a Supabase y auto-creación de tablas
   ├─ src/app/            páginas y rutas API (BFF)
   ├─ supabase/schema.sql esquema de base de datos
   └─ vercel.json         cron diario
```

## Aviso de datos

Los datos de las convocatorias provienen de la [Base de Datos Nacional de
Subvenciones](https://www.infosubvenciones.es) (BDNS), la fuente oficial del
Ministerio de Hacienda de España. Este proyecto no tiene ninguna vinculación
con la BDNS; es un buscador y un lector de esa fuente pública.
