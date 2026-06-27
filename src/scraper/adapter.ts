/**
 * @file SiteAdapter contract and types for the JSF scraping engine.
 *
 * The adapter interface isolates site-specific logic (URLs, form IDs,
 * field mappings, PDF param extraction) from the generic pagination
 * engine. Implement this to add support for a new JSF/PrimeFaces site.
 */

import type { Cheerio } from 'cheerio';

import type { SectionConfig, ScrapedRecord, DownloadJob } from '../types.js';

/**
 * Site-specific adapter contract for the JSF scraping engine.
 *
 * Implementations configure URLs, form parameters, field mappings,
 * and row-parsing logic for a particular PrimeFaces site.
 */
export interface SiteAdapter {
  /** Human-readable site name (e.g. "OEFA") */
  name: string;
  /** Base URL (protocol + host, no trailing slash) */
  baseUrl: string;
  /** Default PrimeFaces form client ID (e.g. "listarDetalleInfraccionRAAForm") */
  formId: string;
  /** Default DataTable widget var (e.g. "listarDetalleInfraccionRAAForm:dt") */
  widgetVar: string;
  /** Available sections (each gets its own scrape run) */
  sections: SectionConfig[];

  /**
   * Parse a PrimeFaces DataTable `<tr>` element into a typed record.
   *
   * @param $tr - Cheerio-wrapped table row from the parsed HTML
   * @returns A scraped record, or null if the row should be skipped
   */
  parseRow($tr: Cheerio<unknown>): ScrapedRecord | null;

  /**
   * Build a download job from a scraped record.
   *
   * Extracts the `param_uuid` and form action URL from the record's
   * mojarra.jsfcljs-style download link.
   *
   * @param record - Previously scraped metadata record
   * @returns DownloadJob if a PDF link was found, null otherwise
   */
  extractDownloadParams(record: ScrapedRecord): DownloadJob | null;
}
