import { XMLParser } from 'fast-xml-parser';
import { load, Cheerio } from 'cheerio';
import type { AnyNode } from 'domhandler';

/**
 * Parses JSF partial-response XML documents.
 *
 * JSF AJAX responses use a specific XML format:
 * ```xml
 * <partial-response>
 *   <changes>
 *     <update id="..."><![CDATA[HTML content]]></update>
 *     <update id="javax.faces.ViewState"><![CDATA[VIEWSTATE_VALUE]]></update>
 *   </changes>
 * </partial-response>
 * ```
 *
 * This parser extracts CDATA-wrapped HTML from `<update id="...">` elements
 * and cheerio-loads the HTML for row-level parsing by adapters.
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
   * Parse a JSF partial-response XML string and extract HTML table rows
   * from all `<update>` elements.
   *
   * @param xml - Raw partial-response XML string
   * @returns Cheerio collection of `<tr>` elements, or null if none found
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
   * Extract the ViewState value from a partial-response XML.
   * Looks for `<update id="javax.faces.ViewState"><![CDATA[...]]></update>`.
   *
   * @param xml - Raw partial-response XML string
   * @returns ViewState string or null if not found
   */
  extractViewState(xml: string): string | null {
    const updates = this.getUpdates(xml);
    if (!updates) return null;

    for (const update of updates) {
      // fast-xml-parser: `@_id` when attributeNamePrefix is '@_'
      if (update['@_id'] === 'javax.faces.ViewState') {
        return this.getCdataContent(update) || null;
      }
    }

    return null;
  }

  /**
   * Parse the XML and return update elements array.
   */
  private getUpdates(xml: string): Record<string, unknown>[] | null {
    const parsed = this.parser.parse(xml);

    // Navigate: partial-response > changes > update[]
    const partialResponse = parsed?.['partial-response'];
    if (!partialResponse) return null;

    const changes = partialResponse?.changes;
    if (!changes) return null;

    // changes may be an array (isArray forces it) or a plain object.
    // Normalize to a single changes block.
    const changesBlock = Array.isArray(changes) ? changes[0] : changes;
    if (!changesBlock) return null;

    // changes.update may be an object (single) or array
    const updates = changesBlock?.update;
    if (!updates) return null;

    return Array.isArray(updates) ? updates : [updates];
  }

  /**
   * Extract CDATA text content from a parsed update element.
   * fast-xml-parser stores CDATA content under `#cdata-section`.
   */
  private getCdataContent(update: Record<string, unknown>): string | undefined {
    // fast-xml-parser v4 stores CDATA text under `#text`
    if (typeof update['#text'] === 'string') return update['#text'] as string;

    // Some configurations store CDATA as `#cdata-section`
    if (typeof update['#cdata-section'] === 'string') return update['#cdata-section'];

    return undefined;
  }
}
