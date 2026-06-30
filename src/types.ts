/**
 * Configuración de una sección/mesa en la página destino.
 * Cada sección corresponde a un PrimeFaces DataTable con su propia
 * URL, ID de formulario y widget variable.
 */
export interface SectionConfig {
  /** Clave interna (ej. "tfa", "dfsai") */
  key: string;
  /** Etiqueta legible (ej. "TFA", "DFSAI") */
  label: string;
  /** Ruta relativa a baseUrl */
  path: string;
  /** Filas por página (dt_rows) */
  pageSize: number;
  /** ID del formulario JSF para POST AJAX */
  formId: string;
  /** Nombre del widget PrimeFaces */
  widgetVar: string;
}

/**
 * Registro individual extraído de una fila del DataTable.
 * El índice dinámico permite nombres de campo variables por adapter.
 * Los campos del sistema (_section, _uuid) siempre están presentes.
 */
export interface ScrapedRecord {
  [field: string]: string | null;
  /** Sección a la que pertenece */
  _section: string;
  /** UUID para descarga PDF, null si no hay descarga */
  _uuid: string | null;
}

/**
 * Trabajo de descarga PDF pendiente, extraído de un registro.
 */
export interface DownloadJob {
  /** Valor del UUID del manejador onclick JSF */
  uuid: string;
  /** URL de acción del formulario */
  url: string;
  /** Parámetros del formulario (incluye param_uuid, etc.) */
  formParams: Record<string, string>;
  /** Contador de reintentos (base 0) */
  retryCount: number;
}

/**
 * Opciones de formato para la exportación de datos.
 */
export interface ExportOptions {
  /** Formato de salida */
  format: 'jsonl' | 'csv';
  /** Subconjunto opcional de campos a exportar (por defecto: todos) */
  fieldFilter?: string[];
  /** Append en lugar de sobrescribir */
  append?: boolean;
}

// SiteAdapter se define en src/scraper/adapter.ts
// Re-exportado aquí por conveniencia.
export type { SiteAdapter } from './scraper/adapter.js';
