/**
 * @file Contrato SiteAdapter para el motor de scraping JSF.
 * Aísla la lógica específica del sitio (URLs, formularios, mapeo
 * de columnas, parámetros PDF) del motor de paginación genérico.
 */

import type { Cheerio } from 'cheerio';

import type { SectionConfig, ScrapedRecord, DownloadJob } from '../types.js';

/**
 * Contrato del adapter específico del sitio para el motor JSF.
 * Las implementaciones configuran URLs, parámetros de formulario,
 * mapeo de columnas y lógica de parseo de filas.
 */
export interface SiteAdapter {
  /** Nombre legible del sitio (ej. "OEFA") */
  name: string;
  /** URL base (protocolo + host, sin barra final) */
  baseUrl: string;
  /** ID del formulario JSF por defecto */
  formId: string;
  /** Nombre del widget DataTable por defecto */
  widgetVar: string;
  /** Secciones disponibles (cada una ejecuta su propio scrape) */
  sections: SectionConfig[];

  /**
   * Parsea un elemento `<tr>` del DataTable PrimeFaces a un registro.
   *
   * @param $tr - Fila de tabla envuelta en Cheerio
   * @returns Registro extraído, o null si debe omitirse
   */
  parseRow($tr: Cheerio<unknown>): ScrapedRecord | null;

  /**
   * Construye un trabajo de descarga desde un registro extraído.
   * Extrae el `param_uuid` y la URL de acción del enlace de descarga
   * con formato mojarra.jsfcljs.
   *
   * @param record - Registro de metadatos previamente extraído
   * @returns DownloadJob si se encontró un enlace PDF, null si no
   */
  extractDownloadParams(record: ScrapedRecord): DownloadJob | null;
}
