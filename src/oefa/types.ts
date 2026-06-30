/**
 * @file Interfaces de registro tipado para las tres secciones de consulta
 * pública de OEFA.
 *
 * Todos los campos son strings nullable para manejar celdas vacías
 * o ausentes. Definen el conjunto canónico de campos de cada sección.
 */

/**
 * Registro de la sección TFA (Tribunal de Fiscalización Ambiental).
 *
 * Mapea al DataTable de `consultaTfa.xhtml` con 6 columnas:
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
 * Registro de la sección DFSAI (Dirección de Fiscalización Sanción y
 * Asuntos de Impacto).
 *
 * Mapea al DataTable de `consultaDfsai.xhtml` con 6 columnas:
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
 * Registro de la sección IGA (Instrumentos de Gestión Ambiental).
 *
 * Mapea al DataTable de `consultaIga.xhtml` con 5 columnas:
 * Nro, Administrado, Unidad fiscalizable, Sector, Tipo de instrumento.
 */
export interface IgaRecord {
  nro: string | null;
  administrado: string | null;
  unidadFiscalizable: string | null;
  sector: string | null;
  tipoInstrumento: string | null;
}
