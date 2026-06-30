/**
 * Tests unitarios de ScraperEngine.isStaleSession() — detección de
 * página de login en respuestas AJAX JSF.
 *
 * El motor debe detectar sesión expirada cuando la respuesta AJAX
 * contiene marcadores HTML de página de login (j_username, Iniciar
 * Sesión, etc.) y abortar con StaleSessionError.
 *
 * isStaleSession se expuso como público en ScraperEngine para poder
 * testearla directamente sin servidor HTTP.
 */

import { describe, it, expect } from 'vitest';
import { ScraperEngine } from '../scraper/engine.js';
import type { SiteAdapter, SectionConfig, ScrapedRecord, DownloadJob } from '../types.js';

// ---------------------------------------------------------------------------
// Mocks mínimos para construir el engine
// ---------------------------------------------------------------------------

class TestAdapter implements SiteAdapter {
  readonly name = 'Test';
  readonly baseUrl = 'http://localhost:0';
  readonly formId = 'testForm';
  readonly widgetVar = 'testForm:dt';
  readonly sections: SectionConfig[] = [];
  parseRow(_$tr: any): ScrapedRecord | null { return null; }
  extractDownloadParams(_record: ScrapedRecord): DownloadJob | null { return null; }
}

class TestSession {
  getViewState() { return null; }
  updateViewState(_vs: string) { /* noop */ }
  async init(_path?: string) { /* noop */ }
  async post(_path: string, _data: Record<string, string>) {
    return { data: '' } as any;
  }
  getBaseUrl() { return 'http://localhost:0'; }
}

describe('Stale session detection', () => {
  const adapter = new TestAdapter();
  const session = new TestSession() as any;
  const engine = new ScraperEngine(adapter, session);

  it('returns true when XML contains j_username', () => {
    const xml = `<html><body><form>
      <input type="text" name="j_username" />
      <input type="password" name="j_password" />
    </form></body></html>`;
    expect(engine.isStaleSession(xml)).toBe(true);
  });

  it('returns true when XML contains "Iniciar Sesión"', () => {
    const xml = `<html><body><h1>Iniciar Sesión</h1>
      <form><input name="j_username" /></form>
    </body></html>`;
    expect(engine.isStaleSession(xml)).toBe(true);
  });

  it('returns false when content is normal data XML', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<partial-response>
<changes>
<update id="listarDetalleInfraccionRAAForm:dt"><![CDATA[
<table><tbody>
<tr><td>1</td><td>EXP-001</td></tr>
</tbody></table>
]]></update>
<update id="javax.faces.ViewState"><![CDATA[VS_123]]></update>
</changes>
</partial-response>`;
    expect(engine.isStaleSession(xml)).toBe(false);
  });
});
