import Link from "next/link";
import AppHeader from "@/components/app-header";
import { logout } from "@/lib/supabase/actions";
import styles from "./guia.module.css";

/**
 * Guía — cómo funciona Helpfinder
 *
 * Página estática (server component) que explica el producto en español
 * llano y, sobre todo, cómo obtener la API key de Gemini paso a paso.
 * No necesita estado ni llamadas al servidor: solo contenido.
 *
 * Diseño: "hoja informativa" del registro. Columna con regla de margen
 * (el margen de un impreso), secciones etiquetadas como SECCIÓN y, como
 * elemento firma, una estampilla de goma con la bombilla en el bloque de
 * la clave API, eco del sello de la landing.
 */

/**
 * Estampilla de goma que acompaña al bloque de la clave API de Gemini.
 * Eco del sello de la landing: anillo con texto circular y la bombilla
 * en el centro, ligeramente girada.
 */
function KeyStamp() {
  return (
    <svg
      className={styles.stamp}
      viewBox="0 0 100 100"
      width={96}
      height={96}
      role="img"
      aria-label="Tu clave de Gemini"
    >
      <defs>
        <path
          id="hf-key-stamp-ring"
          d="M 50,50 m -38,0 a 38,38 0 1,1 76,0 a 38,38 0 1,1 -76,0"
        />
      </defs>
      <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle
        cx="50"
        cy="50"
        r="44.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.8"
        opacity="0.55"
      />
      <text fontSize="8" letterSpacing="2" fill="currentColor" fontWeight="700">
        <textPath href="#hf-key-stamp-ring" startOffset="0%">
          CLAVE API · GEMINI · CLAVE API · GEMINI · CLAVE API · GEMINI ·
        </textPath>
      </text>
      <g
        transform="translate(50 50) scale(1.05) translate(-12 -12)"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
        <path d="M9 18h6" />
        <path d="M10 22h4" />
      </g>
    </svg>
  );
}

export default function GuiaPage() {
  return (
    <>
      <AppHeader>
        <Link className={styles.navLink} href="/dashboard">
          Mi panel
        </Link>
        <form action={logout}>
          <button className={styles.logout} type="submit">
            Cerrar sesión
          </button>
        </form>
      </AppHeader>

      <main className={styles.guide}>
        <header className={styles.head}>
          <p className={styles.kicker}>Guía de uso</p>
          <h1 className={styles.title}>Cómo funciona Helpfinder</h1>
          <p className={styles.sub}>
            Todo lo que necesitas para sacarle partido a Helpfinder.
          </p>
        </header>

        <section className={styles.section}>
          <p className={styles.sectionLabel}>En qué consiste</p>
          <h2 className={styles.sectionTitle}>Qué es Helpfinder</h2>
          <p className={styles.text}>
            Helpfinder consulta cada día la{" "}
            <a
              className={styles.inlineLink}
              href="https://www.infosubvenciones.es"
              target="_blank"
              rel="noopener noreferrer"
            >
              BDNS
            </a>
            , la base de datos oficial de subvenciones de España, y guarda las
            convocatorias nuevas. Tú describes quién eres en tu propio idioma
            (persona, autónomo, sociedad...), y el panel te muestra cada día
            las ayudas que encajan con tu descripción, ordenadas por
            relevancia.
          </p>
        </section>

        <section className={styles.section}>
          <p className={styles.sectionLabel}>Cómo funciona</p>
          <h2 className={styles.sectionTitle}>El recorrido, en cinco pasos</h2>
          <ol className={styles.steps}>
            <li>
              <strong>Creas tu perfil</strong> En el onboarding: qué eres, en
              qué región te mueves y qué buscas.
            </li>
            <li>
              <strong>El registro diario</strong> Detecta las convocatorias
              nuevas publicadas en la BDNS.
            </li>
            <li>
              <strong>Un filtro determinista</strong> Decide si cada
              ayuda se parece a tu perfil: te encaja, quizá te encaje, o no te
              encaja.
            </li>
            <li>
              <strong>IA puntúa</strong> Solo las que pasaron el filtro,
              con tu propia API key, y explica el motivo.
            </li>
            <li>
              <strong>Tú decides</strong> Cada ayuda se tria con Seguir,
              Posible o Denegar.
            </li>
          </ol>
        </section>

        <section className={styles.section}>
          <p className={styles.sectionLabel}>El panel</p>
          <h2 className={styles.sectionTitle}>Qué verás cada día</h2>
          <p className={styles.text}>
            Las ayudas nuevas entran en la pestaña{" "}
            <strong>Pendientes</strong>. Desde ahí las mueves a{" "}
            <strong>En seguimiento</strong>, <strong>Posibles</strong> o{" "}
            <strong>Denegadas</strong>; la decisión se guarda y sobrevive a
            recargar la página. Si descartas una por error, aparece un aviso
            para deshacerlo.
          </p>
          <p className={styles.text}>
            Las ayudas que no pasaron el filtro no desaparecen: aparecen en la
            sección{" "}
            <strong>
              Todas las nuevas
            </strong>
            , solo con título y enlace, por si se escapa alguna buena.
          </p>
        </section>

        <section className={styles.keySection}>
          <div className={styles.keyHead}>
            <div className={styles.keyText}>
              <p className={styles.keyLabel}>Tu clave de Gemini</p>
              <h2 className={styles.keyTitle}>Crea tu API key</h2>
            </div>
            <KeyStamp />
          </div>
          <p className={styles.text}>
            Helpfinder no tiene una key compartida: cada usuario aporta la
            suya, gratis, y se usa solo en el servidor para puntuar tus
            ayudas. Nunca se envía al navegador ni se comparte con nadie.
          </p>
          <ol className={styles.steps}>
            <li>
              Abre{" "}
              <a
                className={styles.inlineLink}
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
              >
                aistudio.google.com/apikey
              </a>{" "}
              e inicia sesión con tu cuenta de Google.
            </li>
            <li>
              Pulsa <strong>Create API key</strong>. Si te pregunta por un
              proyecto de Google Cloud, selecciona uno o crea uno nuevo y
              continúa.
            </li>
            <li>
              Se genera una clave que empieza por{" "}
              <code className={styles.code}>AIza...</code>. Pulsa{" "}
              <strong>Copy</strong> para copiarla.
            </li>
            <li>
              En Helpfinder, ve a <strong>Mi perfil</strong>, pega la clave en
              el campo <strong>API Key de Gemini</strong> y guarda los cambios.
            </li>
          </ol>
          <p className={styles.note}>
            La key gratuita permite alrededor de 1.500 peticiones al día.
            Helpfinder usa una sola llamada por día y usuario.
          </p>
        </section>

        <section className={styles.section}>
          <p className={styles.sectionLabel}>Vocabulario</p>
          <h2 className={styles.sectionTitle}>Palabras que verás aquí</h2>
          <dl className={styles.glossary}>
            <div className={styles.glossaryRow}>
              <dt>BDNS</dt>
              <dd>
                Base de Datos Nacional de Subvenciones: el registro oficial de
                ayudas públicas de España.
              </dd>
            </div>
            <div className={styles.glossaryRow}>
              <dt>Convocatoria</dt>
              <dd>Cada ayuda publicada, con su número de referencia único.</dd>
            </div>
            <div className={styles.glossaryRow}>
              <dt>Matcher</dt>
              <dd>
                El filtro determinista que decide si una ayuda encaja con tu
                perfil, sin gastar IA.
              </dd>
            </div>
            <div className={styles.glossaryRow}>
              <dt>Encaje por reglas</dt>
              <dd>
                Resultado del matcher cuando Gemini no puntuó: la ayuda se
                muestra con el motivo de la regla.
              </dd>
            </div>
            <div className={styles.glossaryRow}>
              <dt>Triaje</dt>
              <dd>
                La decisión que tomas sobre cada ayuda: Seguir, Posible o
                Denegar.
              </dd>
            </div>
          </dl>
        </section>

        <section className={styles.section}>
          <p className={styles.sectionLabel}>Sin IA</p>
          <h2 className={styles.sectionTitle}>Sin IA también funciona</h2>
          <p className={styles.text}>
            Si la cuota de Gemini se agota o no has configurado tu key, el
            panel no se rompe: muestra las ayudas que pasaron el filtro con el
            motivo de la regla (&laquo;coincide tu sector y región&raquo;).
            Con tu key configurada, además recibes puntuación y una
            explicación propia de cada ayuda.
          </p>
        </section>

        <Link className={styles.back} href="/dashboard">
          Volver a tu panel
        </Link>
      </main>
    </>
  );
}
