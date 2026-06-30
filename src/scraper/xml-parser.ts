import { XMLParser } from 'fast-xml-parser';
import { load, Cheerio } from 'cheerio';
import type { AnyNode } from 'domhandler';

/**
 * Parsea documentos XML de respuesta parcial JSF.
 *
 * Las respuestas AJAX de JSF usan un formato XML específico:
 * ```xml
 * <partial-response>
 *   <changes>
 *     <update id="..."><![CDATA[HTML content]]></update>
 *     <update id="javax.faces.ViewState"><![CDATA[VIEWSTATE_VALUE]]></update>
 *   </changes>
 * </partial-response>
 * ```
 *
 * Este parser extrae HTML envuelto en CDATA de elementos `<update id="...">`
 * y carga el HTML con cheerio para que los adapters parseen las filas.
 */
export class JsfXmlParser {
  private parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name) =>
        name === 'update' || name === 'tr' || name === 'td',
      // ponytail: CDATA is parsed as #cdata-section by default
      // which is fine for our extraction pattern
      trimValues: true,
    });
  }

  /**
   * Parsea un XML de respuesta parcial JSF y extrae filas de tabla HTML
   * de todos los elementos `<update>`.
   *
   * @param xml - XML crudo de respuesta parcial
   * @returns Colección Cheerio de `<tr>`, o null si no se encuentran
   */
  parseRows(xml: string): Cheerio<AnyNode> | null {
    const updates = this.getUpdates(xml);
    if (!updates || updates.length === 0) return null;

    for (const update of updates) {
      const cdata = this.getCdataContent(update);
      if (!cdata) continue;

      const $ = load(cdata);
      const rows = $('tr');
      if (rows.length > 0) return rows;
    }

    return null;
  }

  /**
   * Extrae el ViewState de un XML de respuesta parcial.
   * Busca `<update id="javax.faces.ViewState"><![CDATA[...]]></update>`.
   *
   * @param xml - XML crudo de respuesta parcial
   * @returns String del ViewState o null si no se encuentra
   */
  extractViewState(xml: string): string | null {
    const updates = this.getUpdates(xml);
    if (!updates) return null;

    for (const update of updates) {
      // fast-xml-parser: `@_id` cuando attributeNamePrefix es '@_'
      if (update['@_id'] === 'javax.faces.ViewState') {
        return this.getCdataContent(update) || null;
      }
    }

    return null;
  }

  /**
   * Parsea el XML y devuelve un array de elementos update.
   */
  private getUpdates(xml: string): Record<string, unknown>[] | null {
    const parsed = this.parser.parse(xml);

    const partialResponse = parsed?.['partial-response'];
    if (!partialResponse) return null;

    const changes = partialResponse?.changes;
    if (!changes) return null;

    const changesBlock = Array.isArray(changes) ? changes[0] : changes;
    if (!changesBlock) return null;

    const updates = changesBlock?.update;
    if (!updates) return null;

    return Array.isArray(updates) ? updates : [updates];
  }

  /**
   * Extrae el texto CDATA de un elemento update parseado.
   * fast-xml-parser guarda el contenido CDATA bajo `#cdata-section`.
   */
  private getCdataContent(update: Record<string, unknown>): string | undefined {
    // fast-xml-parser v4 stores CDATA text under `#text`
    if (typeof update['#text'] === 'string') return update['#text'] as string;

    // Some configurations store CDATA as `#cdata-section`
    if (typeof update['#cdata-section'] === 'string') return update['#cdata-section'];

    return undefined;
  }
}
