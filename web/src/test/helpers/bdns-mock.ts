import { vi } from "vitest";

/**
 * Arnés de pruebas para BDNS (Fase 0).
 *
 * No sustituye a la API real: permite reproducir de forma determinista los
 * escenarios que hoy nos duelen en producción (429, timeouts, respuestas con
 * `organo.nivel2`, regiones vacías...) sin depender de la red ni del ritmo de
 * BDNS.
 *
 * Uso típico:
 *
 *   const bdns = createBdnsFetch((url) => {
 *     if (url.pathname.endsWith("/convocatorias")) {
 *       return { status: 429, headers: { "Retry-After": "1" } };
 *     }
 *     return { body: bdnsDetailFixture("123") };
 *   });
 *   vi.stubGlobal("fetch", bdns.fetch);
 */

export type BdnsMockReply = {
  /** HTTP status. Default: 200. */
  status?: number;
  /** JSON body. */
  body?: unknown;
  /** Response headers. */
  headers?: Record<string, string>;
  /** Artificial delay before responding (ms). */
  delayMs?: number;
  /** Reject as a network error instead of returning a Response. */
  networkError?: string;
  /** Never resolve until the request is aborted. */
  hang?: boolean;
};

export type BdnsMockHandler = (
  url: URL,
  init?: RequestInit
) => BdnsMockReply | Promise<BdnsMockReply>;

export type BdnsMock = {
  fetch: typeof fetch;
  /** URLs llamadas, en orden. */
  calls: string[];
};

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

/** Promesa que no resuelve nunca; solo se rechaza si llega un abort. */
function waitForAbort(signal?: AbortSignal | null): Promise<void> {
  return new Promise((_resolve, reject) => {
    if (!signal) return;
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    signal.addEventListener(
      "abort",
      () => reject(new DOMException("Aborted", "AbortError")),
      { once: true }
    );
  });
}

/**
 * Crea un `fetch` falso que responde según el handler recibido.
 * Lleva la cuenta de las URLs llamadas para poder afirmar cuántos reintentos
 * hubo.
 */
export function createBdnsFetch(handler: BdnsMockHandler): BdnsMock {
  const calls: string[] = [];

  const fakeFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    calls.push(raw);
    const url = new URL(raw);
    const reply = await handler(url, init);

    if (reply.hang) {
      await waitForAbort(init?.signal);
    }

    if (reply.delayMs && reply.delayMs > 0) {
      await sleep(reply.delayMs, init?.signal);
    }

    if (reply.networkError) {
      throw new TypeError(reply.networkError);
    }

    return new Response(
      reply.body === undefined ? null : JSON.stringify(reply.body),
      {
        status: reply.status ?? 200,
        headers: {
          "Content-Type": "application/json",
          ...(reply.headers ?? {}),
        },
      }
    );
  };

  return { fetch: fakeFetch as typeof fetch, calls };
}

/** Respuesta de detalle con la forma REAL de BDNS (organismo anidado). */
export function bdnsDetailFixture(
  id: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: Number(id) || 1,
    organo: {
      nivel1: "LOCAL",
      nivel2: "Ayuntamiento de Prueba",
      nivel3: "Área de Subvenciones",
    },
    sedeElectronica: null,
    codigoBDNS: id,
    fechaRecepcion: "2026-10-29",
    instrumentos: [{ descripcion: "SUBVENCIÓN Y ENTREGA DINERARIA" }],
    tipoConvocatoria: "Concurrencia competitiva",
    presupuestoTotal: 10_000,
    mrr: false,
    descripcion: `Ayuda de prueba ${id}`,
    descripcionLeng: `Ayuda de prova ${id}`,
    tiposBeneficiarios: [
      { descripcion: "PERSONAS FÍSICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA" },
    ],
    sectores: [{ descripcion: "Servicios personales", codigo: "96" }],
    regiones: [{ descripcion: "ES13 - Comunidad de Madrid" }],
    descripcionFinalidad: "Finalidad de prueba",
    abierto: false,
    fechaInicioSolicitud: null,
    fechaFinSolicitud: null,
    textInicio: "DÍA SIGUIENTE DE SU PUBLICACIÓN",
    textFin: "VEINTE DÍAS DESPUÉS DE SU PUBLICACIÓN",
    ...overrides,
  };
}

/** Respuesta de búsqueda con la forma REAL de BDNS. */
export function bdnsSearchFixture(
  items: Array<Record<string, unknown>>,
  total = items.length
): Record<string, unknown> {
  return {
    content: items,
    pageable: {
      pageNumber: 0,
      pageSize: items.length,
      sort: { empty: false, sorted: true, unsorted: false },
      offset: 0,
      paged: true,
      unpaged: false,
    },
    last: true,
    totalElements: total,
    totalPages: 1,
    first: true,
    sort: { empty: false, sorted: true, unsorted: false },
    numberOfElements: items.length,
    size: items.length,
    number: 0,
    empty: items.length === 0,
  };
}

/** Atajo para simular los primeros N intentos con 429 y luego un 200. */
export function rateLimitThenOk(
  failures: number,
  body: unknown,
  status = 429
): BdnsMockHandler {
  let attempt = 0;
  return () => {
    attempt += 1;
    if (attempt <= failures) {
      return { status, headers: { "Retry-After": "1" }, body: { error: status } };
    }
    return { body };
  };
}

/** Instala el fetch falso y lo desinstala al terminar el test. */
export function stubBdnsFetch(mock: BdnsMock): void {
  vi.stubGlobal("fetch", mock.fetch);
}
