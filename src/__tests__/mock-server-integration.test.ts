/**
 * Test de integración con servidor HTTP mock PrimeFaces.
 * Levanta un servidor HTTP local que simula un endpoint de respuesta
 * parcial JSF/PrimeFaces con paginación. Verifica que el motor de
 * scraping maneje correctamente múltiples offsets de paginación.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { ScraperEngine } from '../scraper/engine.js';
import { HttpSession } from '../scraper/session.js';
import type { SiteAdapter, SectionConfig, ScrapedRecord, DownloadJob } from '../types.js';

// ---------------------------------------------------------------------------
// Adapter mock
// ---------------------------------------------------------------------------

class MockAdapter implements SiteAdapter {
  readonly name = 'Mock';
  readonly baseUrl: string;
  readonly formId = 'testForm';
  readonly widgetVar = 'testForm:dt';
  readonly sections: SectionConfig[] = [
    {
      key: 'test',
      label: 'Test',
      path: '/test.xhtml',
      pageSize: 10,
      formId: 'testForm',
      widgetVar: 'testForm:dt',
    },
  ];

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  parseRow($tr: any): ScrapedRecord | null {
    const $tds = $tr.find('td');
    if ($tds.length === 0) return null;
    const nro = $tds.eq(0).text().trim();
    const name = $tds.eq(1).text().trim();
    return { _section: 'test', _uuid: null, nro, name };
  }

  extractDownloadParams(_record: ScrapedRecord): DownloadJob | null {
    return null;
  }

  getSection(key: string): SectionConfig | null {
    return this.sections.find((s) => s.key === key) ?? null;
  }
}

// ---------------------------------------------------------------------------
// Servidor mock
// ---------------------------------------------------------------------------

/**
 * Genera XML de respuesta parcial JSF para un offset dado.
 * Devuelve registros 1–10 en cada offset, o vacío cuando offset >= 50.
 */
function generateResponse(offset: number, viewState: string): string {
  if (offset >= 50) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<partial-response>
<changes>
<update id="testForm:dt"><![CDATA[
<table><tbody></tbody></table>
]]></update>
<update id="javax.faces.ViewState"><![CDATA[${viewState}]]></update>
</changes>
</partial-response>`;
  }

  let rows = '';
  for (let i = 1; i <= 10; i++) {
    const idx = offset + i;
    rows += `<tr><td>${idx}</td><td>Record ${idx}</td></tr>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<partial-response>
<changes>
<update id="testForm:dt"><![CDATA[
<table><tbody>
${rows}
</tbody></table>
]]></update>
<update id="javax.faces.ViewState"><![CDATA[${viewState}]]></update>
</changes>
</partial-response>`;
}

let server: Server;
let port: number;
let pageCount = 0;

/**
 * Manejador de peticiones del servidor JSF mock.
 *
 * - GET /test.xhtml devuelve HTML con ViewState inicial
 * - POST /test.xhtml devuelve XML de respuesta parcial con datos paginados
 * - Rastrea el offset dt_first para simular paginación
 */
function requestHandler(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
): void {
  const url = new URL(req.url || '/', `http://localhost:${port}`);

  if (req.method === 'GET' && url.pathname === '/test.xhtml') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Set-Cookie': 'JSESSIONID=mock-session-123; Path=/; HttpOnly',
    });
    res.end(`<!DOCTYPE html>
<html><body>
<form>
<input type="hidden" name="javax.faces.ViewState" value="INITIAL_VS" />
</form>
</body></html>`);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/test.xhtml') {
    let body = '';
    req.on('data', (chunk: string) => { body += chunk; });
    req.on('end', () => {
      const params = new URLSearchParams(body);
      const offset = parseInt(params.get('dt_first') || params.get('testForm:dt_first') || '0', 10);
      const newVs = `VS_AFTER_OFFSET_${offset}`;
      pageCount++;

      const response = generateResponse(offset, newVs);

      res.writeHead(200, {
        'Content-Type': 'text/xml; charset=utf-8',
      });
      res.end(response);
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Mock PrimeFaces integration', () => {
  beforeAll(async () => {
    server = createServer(requestHandler);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterAll(() => {
    server?.close();
  });

  it('scrapes all 50 records across 5 pagination pages', async () => {
    const baseUrl = `http://127.0.0.1:${port}`;
    const adapter = new MockAdapter(baseUrl);
    const session = new HttpSession(baseUrl);

    pageCount = 0;

    await session.init('/test.xhtml');

    const engine = new ScraperEngine(adapter, session, {
      maxRetries: 2,
      backoffBaseMs: 10,
    });

    const section = adapter.sections[0]!;
    const records = await engine.scrapeSection(section);

    // Debería tener 50 registros (5 páginas × 10 registros)
    expect(records.length).toBe(50);

    expect(records[0]?.nro).toBe('1');
    expect(records[0]?.name).toBe('Record 1');
    expect(records[49]?.nro).toBe('50');
    expect(records[49]?.name).toBe('Record 50');

    // 5 páginas de datos (offsets 0, 10, 20, 30, 40) + 1 terminación vacía (offset 50)
    expect(pageCount).toBe(6);
  });

  it('handles empty result set gracefully', async () => {
    const baseUrl = `http://127.0.0.1:${port}`;
    const adapter = new MockAdapter(baseUrl);
    const session = new HttpSession(baseUrl);

    pageCount = 0;

    await session.init('/test.xhtml');

    const engine = new ScraperEngine(adapter, session, {
      maxRetries: 1,
      backoffBaseMs: 10,
      maxPages: 0, // No debe producir páginas
    });

    const section = adapter.sections[0]!;
    const records = await engine.scrapeSection(section);

    expect(records.length).toBe(0);
  });
});
