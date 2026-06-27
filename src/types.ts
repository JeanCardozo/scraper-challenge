/**
 * Configuration for a single data section/table on the target page.
 * Each section corresponds to a PrimeFaces DataTable with its own
 * URL path, form ID, and widget variable.
 */
export interface SectionConfig {
  /** Machine-readable key (e.g. "tfa", "dfsai") */
  key: string;
  /** Human-readable label (e.g. "TFA", "DFSAI") */
  label: string;
  /** URL path relative to baseUrl */
  path: string;
  /** Rows per page (dt_rows) */
  pageSize: number;
  /** JSF form client ID for AJAX POST */
  formId: string;
  /** PrimeFaces widget variable name */
  widgetVar: string;
}

/**
 * A single scraped record from a DataTable row.
 * Index signature allows dynamic field names from adapter mappings.
 * System fields (_section, _uuid) are always present.
 */
export interface ScrapedRecord {
  [field: string]: string | null;
  /** Section key this record belongs to */
  _section: string;
  /** UUID for PDF download, null if no download available */
  _uuid: string | null;
}

/**
 * Describes a pending PDF download job extracted from a record.
 */
export interface DownloadJob {
  /** UUID parameter value from the JSF click handler */
  uuid: string;
  /** Form action URL for the POST */
  url: string;
  /** Form parameters to send (includes param_uuid, etc.) */
  formParams: Record<string, string>;
  /** Current retry attempt count (0-based) */
  retryCount: number;
}

/**
 * Configuration for data export formatting.
 */
export interface ExportOptions {
  /** Output format */
  format: 'jsonl' | 'csv';
  /** Optional subset of fields to export (default: all) */
  fieldFilter?: string[];
  /** Append to existing file instead of overwriting */
  append?: boolean;
}

// SiteAdapter is defined in src/scraper/adapter.ts
// Re-exported here for convenience.
export type { SiteAdapter } from './scraper/adapter.js';
