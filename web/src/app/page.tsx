"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { GrantItem } from "@/lib/domain/grants";
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

export default function Home() {
  // ── filtros (input) ──
  const [queryInput, setQueryInput] = useState("");
  const [tipoAdminInput, setTipoAdminInput] = useState("");
  const [regionIdInput, setRegionIdInput] = useState<string>("");
  const [fechaDesdeInput, setFechaDesdeInput] = useState("");
  const [fechaHastaInput, setFechaHastaInput] = useState("");
  const [orderInput, setOrderInput] = useState("fechaRecepcion");
  const [direccionInput, setDireccionInput] = useState<"asc" | "desc">("desc");

  // ── filtros aplicados ──
  const [query, setQuery] = useState("");
  const [tipoAdmin, setTipoAdmin] = useState("");
  const [regionId, setRegionId] = useState<number | undefined>(undefined);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [order, setOrder] = useState("fechaRecepcion");
  const [direccion, setDireccion] = useState<"asc" | "desc">("desc");

  // ── datos ──
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [results, setResults] = useState<GrantItem[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<SearchState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

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
    if (!hasAnyFilter) {
      setState("idle");
      setResults([]);
      setTotal(0);
      return;
    }

    const controller = new AbortController();

    async function search() {
      setState("loading");
      setErrorMsg("");

      try {
        const params = new URLSearchParams({ pageSize: "10" });
        if (query.trim()) params.set("q", query.trim());
        if (tipoAdmin) params.set("tipoAdministracion", tipoAdmin);
        if (typeof regionId === "number") params.set("regionId", String(regionId));
        if (fechaDesde) params.set("fechaDesde", fechaDesde);
        if (fechaHasta) params.set("fechaHasta", fechaHasta);
        if (order) params.set("order", order);
        if (direccion) params.set("direccion", direccion);

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
  }, [query, tipoAdmin, regionId, fechaDesde, fechaHasta, order, direccion]);

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

    setQuery(queryInput);
    setTipoAdmin(tipoAdminInput);
    setRegionId(regionIdInput ? Number(regionIdInput) : undefined);
    setFechaDesde(fechaDesdeInput);
    setFechaHasta(fechaHastaInput);
    setOrder(orderInput);
    setDireccion(direccionInput);
  }

  function handleClear() {
    setQueryInput("");
    setTipoAdminInput("");
    setRegionIdInput("");
    setFechaDesdeInput("");
    setFechaHastaInput("");
    setOrderInput("fechaRecepcion");
    setDireccionInput("desc");

    setQuery("");
    setTipoAdmin("");
    setRegionId(undefined);
    setFechaDesde("");
    setFechaHasta("");
    setOrder("fechaRecepcion");
    setDireccion("desc");
    setErrorMsg("");
    setState("idle");
  }

  return (
    <>
      {/* ── header ── */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.logo}>
            <span className={styles.logoIcon}>◈</span> helpfinder
          </span>
          <span className={styles.tagline}>Ayudas públicas en España</span>
        </div>
      </header>

      {/* ── hero ── */}
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>
          Encuentra las ayudas públicas
          <br />
          que te corresponden
        </h1>
        <p className={styles.heroSub}>
          Buscador gratuito de subvenciones y ayudas de la BDNS
        </p>

        <form className={styles.searchForm} onSubmit={handleSearch}>
          {/* Fila 1: texto, administración, región */}
          <div className={styles.filtersRow}>
            <div className={styles.field}>
              <label htmlFor="q" className={styles.fieldLabel}>Texto</label>
              <input
                id="q"
                className={styles.fieldInput}
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
                <label htmlFor="regionId" className={styles.fieldLabel}>Comunidad Autónoma</label>
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
          <div className={styles.filtersRow}>
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

            <div className={styles.field}>
              <label htmlFor="order" className={styles.fieldLabel}>Ordenar por</label>
              <select
                id="order"
                className={styles.fieldSelect}
                value={orderInput}
                onChange={(e) => setOrderInput(e.target.value)}
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
                value={direccionInput}
                onChange={(e) => setDireccionInput(e.target.value as "asc" | "desc")}
              >
                <option value="desc">Descendente</option>
                <option value="asc">Ascendente</option>
              </select>
            </div>
          </div>

          <div className={styles.actions}>
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

        {state === "done" && results.length > 0 && (
          <>
            <p className={styles.resultsCount}>
              <strong>{total}</strong> resultado{total !== 1 ? "s" : ""}
            </p>
            <ul className={styles.resultsList}>
              {results.map((grant) => (
                <li key={grant.id} className={styles.resultCard}>
                  <span className={styles.resultId}>{grant.id}</span>
                  <h3 className={styles.resultTitle}>{grant.title}</h3>
                  {grant.organization && (
                    <p className={styles.resultOrg}>{grant.organization}</p>
                  )}
                  <div className={styles.resultMeta}>
                    {grant.publicationDate && (
                      <span>Publicado: {grant.publicationDate}</span>
                    )}
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
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {state === "error" && (
          <p className={styles.error}>Error: {errorMsg}</p>
        )}

        {state === "idle" && (
          <div className={styles.idle}>
            <p>Empieza escribiendo lo que necesitas</p>
          </div>
        )}
      </section>

      {/* ── features ── */}
      <section className={styles.features}>
        <div className={styles.feature}>
          <span className={styles.featureIcon}>🔍</span>
          <h3>Busca</h3>
          <p>Escribe lo que necesitas y encuentra ayudas relevantes</p>
        </div>
        <div className={styles.feature}>
          <span className={styles.featureIcon}>📋</span>
          <h3>Filtra</h3>
          <p>Resultados de la BDNS, la base oficial de subvenciones</p>
        </div>
        <div className={styles.feature}>
          <span className={styles.featureIcon}>🚀</span>
          <h3>Descubre</h3>
          <p>Accede directamente al origen de cada ayuda</p>
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
          </a>{" "}
          · Proyecto de aprendizaje
        </p>
      </footer>
    </>
  );
}
