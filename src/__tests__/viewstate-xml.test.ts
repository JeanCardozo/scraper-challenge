/**
 * Test de extracción de ViewState desde XML.
 * Verifica que `JsfXmlParser.extractViewState` extraiga el ViewState
 * de un documento XML de respuesta parcial JSF donde el ViewState
 * está envuelto en CDATA.
 */

import { describe, it, expect } from 'vitest';
import { JsfXmlParser } from '../scraper/xml-parser.js';

describe('ViewState extraction from XML', () => {
  const parser = new JsfXmlParser();

  it('extracts ViewState from CDATA in partial-response', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<partial-response>
<changes>
<update id="javax.faces.ViewState"><![CDATA[VIEW_STATE_ABC_123]]></update>
</changes>
</partial-response>`;

    const vs = parser.extractViewState(xml);
    expect(vs).toBe('VIEW_STATE_ABC_123');
  });

  it('returns null when no ViewState update exists', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<partial-response>
<changes>
<update id="someOtherId"><![CDATA[data]]></update>
</changes>
</partial-response>`;

    const vs = parser.extractViewState(xml);
    expect(vs).toBeNull();
  });

  it('returns null for empty XML', () => {
    const vs = parser.extractViewState('');
    expect(vs).toBeNull();
  });
});
