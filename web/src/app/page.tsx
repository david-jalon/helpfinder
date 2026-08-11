"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import AppHeader from "@/components/app-header";
import type { GrantItem } from "@/lib/domain/grants";
import { sortResults } from "@/lib/grants/sort";
import styles from "./page.module.css";

type SearchState = "idle" | "loading" | "done" | "error";
type RegionOption = { id: number; name: string };

const TIPO_ADMIN_OPTIONS = [
  { value: "", label: "Todas" },
  { value: "C", label: "Estado (C)" },
  { value: "A", label: "Comunidad Autónoma (A)" },
  { value: "L", label: "Entidad Local (L)" },
  { value: "O", label: "Otros órganos (O)" },
];

const ORDER_OPTIONS = [
  { value: "fechaRecepcion", label: "Fecha publicación" },
  { value: "descripcion", label: "Título" },
  { value: "nivel2", label: "Organismo" },
  { value: "numeroConvocatoria", label: "Nº convocatoria" },
];

const PAGE_SIZE = 10;

const DAYS = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const MONTHS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

type StampProps = {
  size?: number;
  label: string;
  center: string;
  centerSub?: string;
  className?: string;
  id?: string;
};

function Stamp({ size = 88, label, center, centerSub, className, id }: StampProps) {
  const generatedId = useId();
  const pathId = id ?? generatedId;
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={`${label} ${center}`}
    >
      <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="50" cy="50" r="44.5" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.55" />
      <defs>
        <path
          id={pathId}
          d="M 50,50 m -38.5,0 a 38.5,38.5 0 1,1 77,0 a 38.5,38.5 0 1,1 -77,0"
        />
      </defs>
      <text fontSize="9.5" letterSpacing="2" fill="currentColor" fontWeight="700">
        <textPath href={`#${pathId}`} startOffset="25%">
          {label}
        </textPath>
      </text>
      <text
        x="50"
        y={centerSub ? 50 : 56}
        textAnchor="middle"
        fontSize={centerSub ? 11 : 13}
        fontWeight="800"
        fill="currentColor"
      >
        {center}
      </text>
      {centerSub && (
        <text
          x="50"
          y="63"
          textAnchor="middle"
          fontSize="7"
          letterSpacing="2.5"
          fontWeight="700"
          fill="currentColor"
        >
          {centerSub}
        </text>
      )}
    </svg>
  );
}

export default function Home() {
  // ── filtros (input) ──
  const [queryInput, setQueryInput] = useState("");
  const [tipoAdminInput, setTipoAdminInput] = useState("");
  const [regionIdInput, setRegionIdInput] = useState<string>("");
  const [fechaDesdeInput, setFechaDesdeInput] = useState("");
  const [fechaHastaInput, setFechaHastaInput] = useState("");

  // ── filtros aplicados ──
  const [query, setQuery] = useState("");
  const [tipoAdmin, setTipoAdmin] = useState("");
  const [regionId, setRegionId] = useState<number | undefined>(undefined);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [order, setOrder] = useState("fechaRecepcion");
  const [direccion, setDireccion] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  // ── datos ──
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [results, setResults] = useState<GrantItem[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<SearchState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Fecha para el sello de la hero (se fija tras el mount para no desincronizar la hidratación)
  const [today, setToday] = useState<{ day: string; year: string } | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  // ── seguir una ayuda desde la landing (Fase 14) ──
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  }

  async function handleFollow(grant: GrantItem) {
    if (followingIds.has(grant.id) || addedIds.has(grant.id)) return;

    setFollowingIds((prev) => new Set(prev).add(grant.id));

    try {
      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: grant.id,
          title: grant.title,
          organization: grant.organization,
          sourceUrl: grant.sourceUrl,
        }),
      });

      if (res.status === 401) {
        window.location.assign("/login?next=/");
        return;
      }

      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "No se pudo añadir la ayuda");
      }

      setAddedIds((prev) => new Set(prev).add(grant.id));
      showToast("Añadido a tu perfil");
    } catch {
      showToast("No se pudo añadir. Prueba otra vez.");
    } finally {
      setFollowingIds((prev) => {
        const copy = new Set(prev);
        copy.delete(grant.id);
        return copy;
      });
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const d = new Date();
      setToday({
        day: `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`,
        year: String(d.getFullYear()),
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Comprobar si hay sesión (Fase 14: /api/auth/status queda fuera del
  // proxy, así en anónimo responde 401 limpio y el botón «Seguir» solo
  // sale cuando de verdad hay sesión)
  useEffect(() => {
    let mounted = true;
    async function checkSession() {
      try {
        const res = await fetch("/api/auth/status", { cache: "no-store" });
        if (mounted) {
          setIsLoggedIn(res.ok);
        }
      } catch {
        if (mounted) setIsLoggedIn(false);
      }
    }
    void checkSession();
    return () => { mounted = false; };
  }, []);

  // Cargar regiones al montar
  useEffect(() => {
    let mounted = true;
    async function loadRegions() {
      try {
        const res = await fetch("/api/catalogs/regions", { cache: "no-store" });
        const json = await res.json();
        if (mounted && res.ok && json.ok && Array.isArray(json.data)) {
          setRegions(json.data);
        }
      } catch {
        // no bloquea
      }
    }
    void loadRegions();
    return () => { mounted = false; };
  }, []);

  // Buscar cuando cambian los filtros aplicados
  useEffect(() => {
    const hasAnyFilter = query || tipoAdmin || regionId !== undefined || fechaDesde || fechaHasta;
    if (!hasAnyFilter) return;

    const controller = new AbortController();

    async function search() {
      setState("loading");
      setErrorMsg("");

      try {
        const params = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
        params.set("page", String(page));
        if (query.trim()) params.set("q", query.trim());
        if (tipoAdmin) params.set("tipoAdministracion", tipoAdmin);
        if (typeof regionId === "number") params.set("regionId", String(regionId));
        if (fechaDesde) params.set("fechaDesde", fechaDesde);
        if (fechaHasta) params.set("fechaHasta", fechaHasta);

        const res = await fetch(
          `/api/grants/search?${params.toString()}`,
          { signal: controller.signal, cache: "no-store" }
        );
        const json = await res.json();

        if (json.ok) {
          setResults(json.data.items);
          setTotal(json.data.total);
          setState("done");
        } else {
          setErrorMsg(json.error || "Error desconocido");
          setState("error");
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setErrorMsg("No se pudo conectar con el servidor");
        setState("error");
      }
    }

    void search();
    return () => controller.abort();
  }, [query, tipoAdmin, regionId, fechaDesde, fechaHasta, page]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();

    if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
      setErrorMsg("La fecha 'desde' no puede ser mayor que la fecha 'hasta'.");
      return;
    }

    setErrorMsg("");

    if (tipoAdminInput && tipoAdminInput !== "A") {
      setRegionId(undefined);
      setRegionIdInput("");
    }

    setPage(1);
    setQuery(queryInput);
    setTipoAdmin(tipoAdminInput);
    setRegionId(regionIdInput ? Number(regionIdInput) : undefined);
    setFechaDesde(fechaDesdeInput);
    setFechaHasta(fechaHastaInput);
  }

  // Orden y dirección se aplican al instante sobre los resultados ya
  // cargados (sortResults), sin volver a llamar a la API.
  function handleOrderChange(value: string) {
    setOrder(value);
  }

  function handleDireccionChange(value: "asc" | "desc") {
    setDireccion(value);
  }

  function handleClear() {
    setQueryInput("");
    setTipoAdminInput("");
    setRegionIdInput("");
    setFechaDesdeInput("");
    setFechaHastaInput("");

    setQuery("");
    setTipoAdmin("");
    setRegionId(undefined);
    setFechaDesde("");
    setFechaHasta("");
    setOrder("fechaRecepcion");
    setDireccion("desc");
    setErrorMsg("");
    setPage(1);
    setState("idle");
  }

  const hasResults = results.length > 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showResults = hasResults && (state === "done" || state === "loading");
  // Orden local al instante: cambiar "Ordenar por"/"Dirección" solo reorden
  // los resultados ya cargados, sin volver a consultar BDNS.
  const sortedResults = useMemo(
    () => sortResults(results, order, direccion),
    [results, order, direccion]
  );
  // Los controles de orden/dirección solo aparecen tras hacer una búsqueda.
  const showSortControls = state === "done" || state === "loading" || state === "error";

  return (
    <>
      {/* ── header ── */}
      <AppHeader>
        <span className={styles.tagline}>Ayudas públicas · España · BDNS</span>
        {isLoggedIn === null ? (
          <span className={styles.headerLink}>&nbsp;</span>
        ) : isLoggedIn ? (
          <a href="/dashboard" className={styles.headerLinkPrimary}>Mi panel</a>
        ) : (
          <a href="/login" className={styles.headerLinkPrimary}>Entrar</a>
        )}
      </AppHeader>

      {/* ── hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroText}>
            <h1 className={styles.heroTitle}>
              Encuentra las ayudas públicas
              <br />
              que te corresponden
            </h1>
            <p className={styles.heroSub}>
              Buscador gratuito de subvenciones y ayudas de la BDNS, la base
              oficial de España.
            </p>
          </div>

          {today && (
            <Stamp
              className={styles.heroStamp}
              size={104}
              label={"NUEVAS AYUDAS · REGISTRO DIARIO · ".repeat(2)}
              center={today.day}
              centerSub={today.year}
              id="hero-seal"
            />
          )}
        </div>

        <form className={styles.searchForm} onSubmit={handleSearch}>
          <div className={styles.searchPanel}>
            {/* Fila 1: texto, administración, región */}
            <div className={styles.filtersRow}>
              <div className={`${styles.field} ${styles.fieldWide}`}>
                <label htmlFor="q" className={styles.fieldLabel}>Palabras clave</label>
                <input
                  id="q"
                  className={`${styles.fieldInput} ${styles.queryInput}`}
                  type="text"
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  placeholder="Ej: digitalización, autónomos, I+D..."
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="tipoAdmin" className={styles.fieldLabel}>Administración</label>
                <select
                  id="tipoAdmin"
                  className={styles.fieldSelect}
                  value={tipoAdminInput}
                  onChange={(e) => {
                    setTipoAdminInput(e.target.value);
                    if (e.target.value !== "A") {
                      setRegionIdInput("");
                    }
                  }}
                >
                  {TIPO_ADMIN_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {tipoAdminInput === "A" && (
                <div className={styles.field}>
                  <label htmlFor="regionId" className={styles.fieldLabel}>Comunidad</label>
                  <select
                    id="regionId"
                    className={styles.fieldSelect}
                    value={regionIdInput}
                    onChange={(e) => setRegionIdInput(e.target.value)}
                  >
                    <option value="">Todas</option>
                    {regions.map((r) => (
                      <option key={r.id} value={String(r.id)}>{r.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Fila 2: fechas, orden, dirección */}
            <div className={styles.filtersRow} style={{ marginTop: "0.75rem" }}>
              <div className={styles.field}>
                <label htmlFor="fechaDesde" className={styles.fieldLabel}>Fecha desde</label>
                <input
                  id="fechaDesde"
                  className={styles.fieldInput}
                  type="date"
                  value={fechaDesdeInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (fechaHastaInput && val && val > fechaHastaInput) {
                      setErrorMsg("La fecha 'desde' no puede ser mayor que la fecha 'hasta'.");
                      return;
                    }
                    setErrorMsg("");
                    setFechaDesdeInput(val);
                  }}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="fechaHasta" className={styles.fieldLabel}>Fecha hasta</label>
                <input
                  id="fechaHasta"
                  className={styles.fieldInput}
                  type="date"
                  value={fechaHastaInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (fechaDesdeInput && val && val < fechaDesdeInput) {
                      setErrorMsg("La fecha 'hasta' no puede ser menor que la fecha 'desde'.");
                      return;
                    }
                    setErrorMsg("");
                    setFechaHastaInput(val);
                  }}
                />
              </div>

              {showSortControls && (
                <>
                  <div className={styles.field}>
                    <label htmlFor="order" className={styles.fieldLabel}>Ordenar por</label>
                    <select
                      id="order"
                      className={styles.fieldSelect}
                      value={order}
                      onChange={(e) => handleOrderChange(e.target.value)}
                    >
                      {ORDER_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="direccion" className={styles.fieldLabel}>Dirección</label>
                    <select
                      id="direccion"
                      className={styles.fieldSelect}
                      value={direccion}
                      onChange={(e) => handleDireccionChange(e.target.value as "asc" | "desc")}
                    >
                      <option value="desc">Descendente</option>
                      <option value="asc">Ascendente</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className={styles.actions} style={{ marginTop: "1rem" }}>
              <button
                className={styles.searchBtn}
                type="submit"
                disabled={state === "loading"}
              >
                {state === "loading" ? "Buscando..." : "Buscar ayudas"}
              </button>
              {(query || tipoAdmin || regionId !== undefined || fechaDesde || fechaHasta) && (
                <button
                  type="button"
                  className={styles.clearBtn}
                  onClick={handleClear}
                >
                  Limpiar filtros
                </button>
              )}
            </div>

            {errorMsg && <p className={styles.filterError}>{errorMsg}</p>}
          </div>
        </form>
      </section>

      {/* ── resultados ── */}
      <section className={styles.results}>
        {state === "done" && results.length === 0 && (
          <p className={styles.empty}>
            No encontramos resultados para esa búsqueda. Prueba con otras
            palabras clave o filtros.
          </p>
        )}

        {showResults && (
          <>
            <p className={styles.resultsCount}>
              <strong>{total}</strong> resultado{total !== 1 ? "s" : ""}
            </p>
            <ul className={styles.resultsList}>
              {sortedResults.map((grant) => (
                <li key={grant.id} className={styles.resultCard}>
                  <div className={styles.resultTop}>
                    <div className={styles.resultRef}>
                      <span className={styles.resultRefNum}>{grant.id}</span>
                      <span className={styles.resultRefLabel}>nº convocatoria</span>
                    </div>
                    <div>
                      <h3 className={styles.resultTitle}>{grant.title}</h3>
                      {grant.organization && (
                        <p className={styles.resultOrg}>{grant.organization}</p>
                      )}
                    </div>
                  </div>
                  <div className={styles.resultMeta}>
                    {grant.publicationDate && (
                      <span>PUBLICADA · {grant.publicationDate}</span>
                    )}
                    <div className={styles.resultMetaActions}>
                      {grant.sourceUrl && (
                        <a
                          className={styles.resultLink}
                          href={grant.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Ver en BDNS →
                        </a>
                      )}
                      {isLoggedIn && (
                        <button
                          type="button"
                          className={`${styles.followBtn} ${
                            addedIds.has(grant.id) ? styles.followBtnAdded : ""
                          }`}
                          disabled={
                            addedIds.has(grant.id) || followingIds.has(grant.id)
                          }
                          onClick={() => handleFollow(grant)}
                        >
                          {addedIds.has(grant.id)
                            ? "Añadido ✓"
                            : followingIds.has(grant.id)
                            ? "Añadiendo…"
                            : "Seguir"}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {totalPages > 1 && (
              <nav className={styles.pagination} aria-label="Paginación de resultados">
                <button
                  type="button"
                  className={styles.pageBtn}
                  disabled={page <= 1 || state === "loading"}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ← Anterior
                </button>
                <span className={styles.pageIndicator}>
                  {state === "loading"
                    ? "Cargando…"
                    : `Página ${page} de ${totalPages}`}
                </span>
                <button
                  type="button"
                  className={styles.pageBtn}
                  disabled={page >= totalPages || state === "loading"}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Siguiente →
                </button>
              </nav>
            )}
          </>
        )}

        {state === "error" && (
          <p className={styles.error}>Error: {errorMsg}</p>
        )}

        {state === "idle" && (
          <div className={styles.idle}>
            <p>Busca las ayudas que necesitas</p>
          </div>
        )}
      </section>

      {/* ── features ── */}
      <section className={styles.features}>
        <div className={styles.feature}>
          <p className={styles.featureLabel}>búsqueda</p>
          <h3 className={styles.featureTitle}>En tus palabras</h3>
          <p className={styles.featureText}>
            Escribe lo que necesitas: digitalización, autónomos, I+D... sin
            códigos ni jerga jurídica.
          </p>
        </div>
        <div className={styles.feature}>
          <p className={styles.featureLabel}>filtros</p>
          <h3 className={styles.featureTitle}>Por lo que importa</h3>
          <p className={styles.featureText}>
            Administración, comunidad y fechas. Los datos vienen de la BDNS, la
            base oficial de subvenciones.
          </p>
        </div>
        <div className={styles.feature}>
          <p className={styles.featureLabel}>origen</p>
          <h3 className={styles.featureTitle}>Al documento oficial</h3>
          <p className={styles.featureText}>
            Cada resultado te lleva a la convocatoria original para que la
            consultes en su fuente.
          </p>
        </div>
      </section>

      {/* ── footer ── */}
      <footer className={styles.footer}>
        <p>
          Helpfinder · Datos de la{" "}
          <a
            href="https://www.infosubvenciones.es"
            target="_blank"
            rel="noopener noreferrer"
          >
            BDNS
          </a>
        </p>
      </footer>

      {/* ── aviso de «seguir» (Fase 14) ── */}
      {toast && (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      )}
    </>
  );
}