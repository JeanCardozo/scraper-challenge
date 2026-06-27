/**
 * @file Typed record interfaces for OEFA's three public consultation sections.
 *
 * All fields are nullable strings to handle missing or empty table cells
 * gracefully. The interfaces define the canonical field set for each
 * section's DataTable columns.
 */

/**
 * Record from the TFA (Tribunal de Fiscalización Ambiental) section.
 *
 * Maps to the `consultaTfa.xhtml` DataTable which has 6 columns:
 * Nro, Número de expediente, Administrado, Unidad fiscalizable,
 * Sector, Nro. Resolución de Apelación.
 */
export interface TfaRecord {
  nro: string | null;
  expediente: string | null;
  administrado: string | null;
  unidadFiscalizable: string | null;
  sector: string | null;
  nroResolucionApelacion: string | null;
}

/**
 * Record from the DFSAI (Dirección de Fiscalización Sanción y
 * Asuntos de Impacto) section.
 *
 * Maps to the `consultaDfsai.xhtml` DataTable which has 6 columns:
 * Nro, Número de expediente, Administrado, Unidad fiscalizable,
 * Sector, Nro. Resolución de Sanción.
 */
export interface DfsaiRecord {
  nro: string | null;
  expediente: string | null;
  administrado: string | null;
  unidadFiscalizable: string | null;
  sector: string | null;
  nroResolucionSancion: string | null;
}

/**
 * Record from the IGA (Instrumentos de Gestión Ambiental) section.
 *
 * Maps to the `consultaIga.xhtml` DataTable which has 5 columns:
 * Nro, Administrado, Unidad fiscalizable, Sector, Tipo de instrumento.
 */
export interface IgaRecord {
  nro: string | null;
  administrado: string | null;
  unidadFiscalizable: string | null;
  sector: string | null;
  tipoInstrumento: string | null;
}
