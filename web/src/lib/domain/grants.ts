/**
 * Modelos de convocatoria compartidos entre BFF, job de alertas y UI.
 * No importar desde aquí código de Next.js ni fetch a BDNS.
 */

export type GrantItem = {
  id: string;
  title: string;
  organization: string | null;
  publicationDate: string | null;
  deadlineDate: string | null;
  amount: number | null;
  sourceUrl: string | null;
  /** Campos de elegibilidad (opcionales, se rellenan en el paso de enriquecimiento vía API BDNS). */
  beneficiaryTypes?: string[];
  sectors?: string[];
  impactRegions?: string[];
  purpose?: string | null;
  instrumentType?: string | null;
};

export type GrantDetail = {
  id: string;
  title: string;
  organization: string | null;
  publicationDate: string | null;
  description: string | null;
  sourceUrl: string | null;
};

export type GrantsSearchResult = {
  items: GrantItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type SearchGrantsParams = {
  q?: string;
  page: number;
  pageSize: number;
  fechaDesde?: string;
  fechaHasta?: string;
  tipoAdministracion?: string;
  order?: string;
  direccion?: "asc" | "desc";
  regionId?: number;
};
