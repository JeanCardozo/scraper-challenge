/**
 * 7.7 Mock PrimeFaces HTTP server integration test.
 *
 * Spins up a local HTTP server that simulates a JSF/PrimeFaces
 * partial-response endpoint with pagination. Tests that the
 * scraper engine correctly handles multiple pagination offsets
 * and returns the expected number of records.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { ScraperEngine } from '../scraper/engine.js';
import { HttpSession } from '../scraper/session.js';
import type { SiteAdapter, SectionConfig, ScrapedRecord, DownloadJob } from '../types.js';

// ---------------------------------------------------------------------------
// Mock adapter
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
// Mock server
// ---------------------------------------------------------------------------

/**
 * Generate JSF partial-response XML for a given offset.
 * Returns records 1–10 at each offset, or empty when offset >= 50.
 */
function generateResponse(offset: number, viewState: string): string {
  if (offset >= 50) {
    // Return empty table - no more records
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
 * Request handler for the mock JSF server.
 *
 * - GET /test.xhtml returns HTML with initial ViewState
 * - POST /test.xhtml returns JSF partial-response XML with paginated data
 * - Tracks dt_first offset to simulate pagination
 */
function requestHandler(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
): void {
  // Parse URL
  const url = new URL(req.url || '/', `http://localhost:${port}`);

  if (req.method === 'GET' && url.pathname === '/test.xhtml') {
    // Return initial HTML page with ViewState
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
    // Parse form data
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

  // 404 for unknown paths
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

    // Reset page count
    pageCount = 0;

    // Initialize session
    await session.init('/test.xhtml');

    // Create engine with minimal backoff for fast tests
    const engine = new ScraperEngine(adapter, session, {
      maxRetries: 2,
      backoffBaseMs: 10,
    });

    // Scrape
    const section = adapter.sections[0]!;
    const records = await engine.scrapeSection(section);

    // Should have 50 records (5 pages × 10 records)
    expect(records.length).toBe(50);

    // Verify record content
    expect(records[0]?.nro).toBe('1');
    expect(records[0]?.name).toBe('Record 1');
    expect(records[49]?.nro).toBe('50');
    expect(records[49]?.name).toBe('Record 50');

    // 5 data pages (offsets 0, 10, 20, 30, 40) + 1 empty-set termination (offset 50)
    expect(pageCount).toBe(6);
  });

  it('handles empty result set gracefully', async () => {
    const baseUrl = `http://127.0.0.1:${port}`;
    const adapter = new MockAdapter(baseUrl);
    const session = new HttpSession(baseUrl);

    pageCount = 0;

    await session.init('/test.xhtml');

    // Use a different path that returns empty
    // We'll modify by using engine directly with a maxPages limit to test
    const engine = new ScraperEngine(adapter, session, {
      maxRetries: 1,
      backoffBaseMs: 10,
      maxPages: 0, // Should produce no pages
    });

    const section = adapter.sections[0]!;
    const records = await engine.scrapeSection(section);

    expect(records.length).toBe(0);
  });
});
