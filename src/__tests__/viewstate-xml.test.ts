/**
 * 7.2 ViewState from XML test.
 *
 * Verifies that `JsfXmlParser.extractViewState` can extract the
 * ViewState from a JSF partial-response XML document where the
 * ViewState is wrapped in CDATA.
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
