/**
 * Test de conteo de filas desde CDATA.
 * Verifica que `JsfXmlParser.parseRows` extraiga correctamente tablas
 * HTML envueltas en CDATA y devuelva el número esperado de `<tr>`.
 */

import { describe, it, expect } from 'vitest';
import { JsfXmlParser } from '../scraper/xml-parser.js';

describe('CDATA row count', () => {
  const parser = new JsfXmlParser();

  it('returns correct row count from CDATA table HTML', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<partial-response>
<changes>
<update id="listarDetalleInfraccionRAAForm:dt"><![CDATA[
<table>
<tbody>
<tr><td>1</td><td>EXP-001</td></tr>
<tr><td>2</td><td>EXP-002</td></tr>
<tr><td>3</td><td>EXP-003</td></tr>
</tbody>
</table>
]]></update>
</changes>
</partial-response>`;

    const rows = parser.parseRows(xml);
    expect(rows).not.toBeNull();
    expect(rows!.length).toBe(3);
  });

  it('returns null when no table rows are found', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<partial-response>
<changes>
<update id="someOtherId"><![CDATA[<div>No table here</div>]]></update>
</changes>
</partial-response>`;

    const rows = parser.parseRows(xml);
    expect(rows).toBeNull();
  });

  it('returns null for empty XML', () => {
    const rows = parser.parseRows('');
    expect(rows).toBeNull();
  });
});
