/**
 * @file OEFA site adapter — SiteAdapter implementation for the Peruvian
 * environmental authority's JSF/PrimeFaces public consultation system.
 *
 * Three sections are configured: TFA (Tribunal de Fiscalización Ambiental),
 * DFSAI (Dirección de Fiscalización Sanción y Asuntos de Impacto), and
 * IGA (Instrumentos de Gestión Ambiental).
 *
 * Column-to-field mappings are defined per section using 0-based <td> indices.
 * PDF download parameters are extracted from mojarra.jsfcljs onclick handlers.
 */

import type { Cheerio } from 'cheerio';
import type { AnyNode } from 'domhandler';

import type {
  SiteAdapter,
  SectionConfig,
  ScrapedRecord,
  DownloadJob,
} from '../types.js';

// ---------------------------------------------------------------------------
// Site constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://publico.oefa.gob.pe/repdig/consulta';

// ---------------------------------------------------------------------------
// Section definitions
// ---------------------------------------------------------------------------

/**
 * Column-to-field mapping per section key.
 * Keys are section keys; values are arrays of field names in column order
 * (0-based <td> index). The last column in each table typically contains
 * the download action link and is NOT mapped to a data field.
 */
const FIELD_MAPS: Record<string, string[]> = {
  tfa: [
    'nro',
    'expediente',
    'administrado',
    'unidadFiscalizable',
    'sector',
    'nroResolucionApelacion',
  ],
  dfsai: [
    'nro',
    'expediente',
    'administrado',
    'unidadFiscalizable',
    'sector',
    'nroResolucionSancion',
  ],
  iga: [
    'nro',
    'administrado',
    'unidadFiscalizable',
    'sector',
    'tipoInstrumento',
  ],
};

/**
 * All available OEFA sections.
 * Each maps to a PrimeFaces DataTable on a distinct JSF page.
 */
const SECTIONS: SectionConfig[] = [
  {
    key: 'tfa',
    label: 'TFA',
    path: '/consultaTfa.xhtml',
    pageSize: 10,
    formId: 'listarDetalleInfraccionRAAForm',
    widgetVar: 'listarDetalleInfraccionRAAForm:dt',
  },
  {
    key: 'dfsai',
    label: 'DFSAI',
    path: '/consultaDfsai.xhtml',
    pageSize: 10,
    formId: 'listarDetalleInfraccionDFSAIForm',
    widgetVar: 'listarDetalleInfraccionDFSAIForm:dt',
  },
  {
    key: 'iga',
    label: 'IGA',
    path: '/consultaIga.xhtml',
    pageSize: 10,
    formId: 'listarInstrumentoGestionAmbientalForm',
    widgetVar: 'listarInstrumentoGestionAmbientalForm:dt',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the `param_uuid` value from a mojarra.jsfcljs onclick handler.
 *
 * The onclick attribute follows this pattern:
 * ```
 * mojarra.jsfcljs(document.getElementById('...'),{...'param_uuid':'<uuid>'...})
 * ```
 *
 * @param onclick - Raw onclick attribute string
 * @returns The extracted UUID, or null if not found
 */
function extractParamUuid(onclick: string): string | null {
  // Match both single and double quoted variants of param_uuid
  const match = onclick.match(/param_uuid['"]\s*:\s*['"]([^'"]+)['"]/);
  return match?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * OEFA site adapter for the JSF scraping engine.
 *
 * Provides section configurations (TFA / DFSAI / IGA), column-to-field
 * row parsing, and PDF download parameter extraction.
 *
 * **Important**: This adapter is stateful. The `currentSection` property
 * tells `parseRow` which field mapping to apply. Call `useSection(key)`
 * before processing each section's rows.
 */
export class OefaAdapter implements SiteAdapter {
  /** Human-readable site name */
  readonly name = 'OEFA';
  /** Base URL for all OEFA consultation endpoints */
  readonly baseUrl = BASE_URL;
  /** Default formId (overridden by SectionConfig at runtime) */
  readonly formId = SECTIONS[0]!.formId;
  /** Default widgetVar (overridden by SectionConfig at runtime) */
  readonly widgetVar = SECTIONS[0]!.widgetVar;
  /** All available sections */
  readonly sections = SECTIONS;

  /**
   * Currently active section key for row parsing.
   * Set via `useSection()` before scraping a section.
   */
  private currentSection: string = 'tfa';

  /**
   * Switch the adapter to a specific section's field mapping.
   *
   * Must be called BEFORE processing rows for a new section.
   * Throws if the section key is unknown.
   *
   * @param key - Section key ("tfa", "dfsai", or "iga")
   */
  useSection(key: string): void {
    if (!FIELD_MAPS[key]) {
      const valid = Object.keys(FIELD_MAPS).join(', ');
      throw new Error(
        `Unknown OEFA section "${key}". Valid sections: ${valid}`,
      );
    }
    this.currentSection = key;
  }

  /**
   * Resolve a section configuration by key.
   *
   * @param key - Section key to look up
   * @returns The section config, or null if not found
   */
  getSection(key: string): SectionConfig | null {
    return SECTIONS.find((s) => s.key === key) ?? null;
  }

  // -----------------------------------------------------------------------
  // SiteAdapter contract
  // -----------------------------------------------------------------------

  /**
   * Parse a PrimeFaces DataTable `<tr>` element into a ScrapedRecord.
   *
   * Maps `<td>` elements to fields using the current section's column
   * mapping. Also scans the action column for a mojarra.jsfcljs onclick
   * handler and extracts the `param_uuid` as `_uuid`.
   *
   * @param $tr - Cheerio-wrapped table row
   * @returns ScrapedRecord with field values, or null if the row is empty
   */
  parseRow($tr: Cheerio<unknown>): ScrapedRecord | null {
    // Cast to AnyNode so cheerio's .find(), .eq(), .last() etc. work
    const $row = $tr as Cheerio<AnyNode>;
    const $tds = $row.find('td');
    if ($tds.length === 0) return null;

    const fields = FIELD_MAPS[this.currentSection];
    if (!fields) return null;

    const record: ScrapedRecord = {
      _section: this.currentSection,
      _uuid: null,
    };

    // Map columns to fields by index
    for (let idx = 0; idx < fields.length; idx++) {
      const $td = $tds.eq(idx);
      const fieldName = fields[idx];
      if (!$td || !fieldName) continue;
      const text = $td.text().trim();
      record[fieldName] = text || null;
    }

    // Extract UUID from the action column's download link
    // The last <td> typically contains <a onclick="mojarra.jsfcljs(...)">
    // or a <button>. Look for both.
    const actionTd = $tds.last();
    if (actionTd) {
      const $action = actionTd as Cheerio<AnyNode>;
      const onclick =
        $action.find('a').attr('onclick') ??
        $action.find('button').attr('onclick');
      if (onclick) {
        const uuid = extractParamUuid(onclick);
        if (uuid) {
          record._uuid = uuid;
        }
      }
    }

    return record;
  }

  /**
   * Build a DownloadJob from a scraped record's UUID.
   *
   * @param record - Previously scraped record (must have _uuid and _section)
   * @returns DownloadJob if a UUID is present, null otherwise
   */
  extractDownloadParams(record: ScrapedRecord): DownloadJob | null {
    const uuid = record._uuid;
    if (!uuid) return null;

    const section = this.getSection(record._section);
    if (!section) return null;

    return {
      uuid,
      url: `${this.baseUrl}${section.path}`,
      formParams: {
        param_uuid: uuid,
        // The JSF form ID is needed for the POST
        _formId: section.formId,
      },
      retryCount: 0,
    };
  }
}
