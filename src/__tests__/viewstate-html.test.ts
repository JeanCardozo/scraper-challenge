/**
 * 7.1 ViewState extraction from HTML test.
 *
 * Verifies that `HttpSession.extractViewStateFromHtml` can find the
 * hidden javax.faces.ViewState input in a full JSF HTML page.
 */

import { describe, it, expect } from 'vitest';
import { HttpSession } from '../scraper/session.js';

describe('ViewState extraction from HTML', () => {
  it('extracts ViewState from hidden input', () => {
    const html = `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Test</title></head>
<body>
<form id="j_idt3" name="j_idt3" method="post" action="/test.xhtml">
<input type="hidden" name="javax.faces.ViewState" id="j_id1:javax.faces.ViewState" value="STATIC_VIEW_STATE_123" autocomplete="off" />
</form>
</body>
</html>`;

    const vs = HttpSession.extractViewStateFromHtml(html);
    expect(vs).toBe('STATIC_VIEW_STATE_123');
  });

  it('returns null when no ViewState input is present', () => {
    const html = '<html><body><form>No ViewState here</form></body></html>';
    const vs = HttpSession.extractViewStateFromHtml(html);
    expect(vs).toBeNull();
  });

  it('returns null for empty HTML', () => {
    const vs = HttpSession.extractViewStateFromHtml('');
    expect(vs).toBeNull();
  });
});
