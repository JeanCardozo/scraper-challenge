/**
 * @file Adapter OEFA — implementación de SiteAdapter para el sistema
 * de consulta pública JSF/PrimeFaces de la autoridad ambiental peruana.
 *
 * Configura tres secciones: TFA (Tribunal de Fiscalización Ambiental),
 * DFSAI (Dirección de Fiscalización Sanción y Asuntos de Impacto), e
 * IGA (Instrumentos de Gestión Ambiental).
 *
 * Los mapeos columna-a-campo se definen por sección usando índices
 * de <td> base 0. Los parámetros de descarga PDF se extraen de los
 * manejadores onclick de mojarra.jsfcljs.
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
// Constantes del sitio
// ---------------------------------------------------------------------------

const BASE_URL = 'https://publico.oefa.gob.pe/repdig/consulta';

// ---------------------------------------------------------------------------
// Definiciones de secciones
// ---------------------------------------------------------------------------

/**
 * Mapeo columna-a-campo por clave de sección.
 * Las claves son los identificadores de sección; los valores son arrays
 * de nombres de campo en orden de columna (índice <td> base 0).
 * La última columna suele contener el enlace de descarga y NO se mapea.
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
 * Todas las secciones OEFA disponibles.
 * Cada una mapea a un PrimeFaces DataTable en una página JSF distinta.
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
 * Extrae el valor de `param_uuid` de un manejador onclick mojarra.jsfcljs.
 *
 * El atributo onclick sigue este patrón:
 * ```
 * mojarra.jsfcljs(document.getElementById('...'),{...'param_uuid':'<uuid>'...})
 * ```
 *
 * @param onclick - Atributo onclick crudo
 * @returns El UUID extraído, o null si no se encuentra
 */
export function extractParamUuid(onclick: string): string | null {
  // Soporta clave con comillas simples o dobles
  const match = onclick.match(/param_uuid['"]\s*:\s*['"]([^'"]+)['"]/);
  return match?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Adapter OEFA para el motor de scraping JSF.
 *
 * Provee configuraciones de sección (TFA / DFSAI / IGA), parseo de filas
 * con mapeo columna-a-campo y extracción de parámetros de descarga PDF.
 *
 * **Importante**: Este adapter tiene estado. La propiedad `currentSection`
 * indica a `parseRow` qué mapeo de campos aplicar. Llama a `useSection(key)`
 * antes de procesar las filas de cada sección.
 */
export class OefaAdapter implements SiteAdapter {
  /** Nombre legible del sitio */
  readonly name = 'OEFA';
  /** URL base para todos los endpoints de consulta OEFA */
  readonly baseUrl = BASE_URL;
  /** formId por defecto (se sobrescribe con SectionConfig en runtime) */
  readonly formId = SECTIONS[0]!.formId;
  /** widgetVar por defecto (se sobrescribe con SectionConfig en runtime) */
  readonly widgetVar = SECTIONS[0]!.widgetVar;
  /** Todas las secciones disponibles */
  readonly sections = SECTIONS;

  /**
   * Clave de sección activa para el parseo de filas.
   * Se establece con `useSection()` antes de scrapear una sección.
   */
  private currentSection: string = 'tfa';

  /**
   * Cambia el adapter al mapeo de campos de una sección específica.
   *
   * Debe llamarse ANTES de procesar filas de una nueva sección.
   * Lanza error si la clave es desconocida.
   *
   * @param key - Clave de sección ("tfa", "dfsai" o "iga")
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
   * Obtiene la configuración de una sección por clave.
   *
   * @param key - Clave de sección a buscar
   * @returns Configuración de la sección, o null si no existe
   */
  getSection(key: string): SectionConfig | null {
    return SECTIONS.find((s) => s.key === key) ?? null;
  }

  // -----------------------------------------------------------------------
  // Contrato SiteAdapter
  // -----------------------------------------------------------------------

  /**
   * Parsea un elemento `<tr>` del DataTable PrimeFaces a ScrapedRecord.
   *
   * Mapea elementos `<td>` a campos usando el mapeo de columnas de la
   * sección actual. También escanea la columna de acción en busca de un
   * manejador onclick mojarra.jsfcljs y extrae el `param_uuid` como `_uuid`.
   *
   * @param $tr - Fila de tabla envuelta en Cheerio
   * @returns ScrapedRecord con valores de campo, o null si la fila está vacía
   */
  parseRow($tr: Cheerio<unknown>): ScrapedRecord | null {
    const $row = $tr as Cheerio<AnyNode>;
    const $tds = $row.find('td');
    if ($tds.length === 0) return null;

    const fields = FIELD_MAPS[this.currentSection];
    if (!fields) return null;

    const record: ScrapedRecord = {
      _section: this.currentSection,
      _uuid: null,
    };

    for (let idx = 0; idx < fields.length; idx++) {
      const $td = $tds.eq(idx);
      const fieldName = fields[idx];
      if (!$td || !fieldName) continue;
      const text = $td.text().trim();
      record[fieldName] = text || null;
    }

    // Extraer UUID del enlace de descarga en la columna de acción
    // La última <td> contiene <a onclick="mojarra.jsfcljs(...)">
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
   * Construye un DownloadJob desde el UUID de un registro extraído.
   *
   * @param record - Registro previamente extraído (debe tener _uuid y _section)
   * @returns DownloadJob si hay UUID presente, null si no
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
        _formId: section.formId,
      },
      retryCount: 0,
    };
  }
}
