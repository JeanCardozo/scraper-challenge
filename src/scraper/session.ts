import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { load } from 'cheerio';

/**
 * Manages an HTTP session with a JSF server.
 *
 * Responsibilities:
 * - Establish JSESSIONID via initial GET request
 * - Extract and rotate javax.faces.ViewState
 * - Maintain a cookie jar via axios request/response interceptors
 */
export class HttpSession {
  private client: AxiosInstance;
  private viewState: string | null = null;
  private baseUrl: string;
  private cookieString = '';

  /**
   * @param baseUrl - Target server base URL (no trailing slash)
   */
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');

    this.client = axios.create({
      withCredentials: true,
      timeout: 30_000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JSF-Scraper/1.0)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    // Response interceptor: capture Set-Cookie headers
    this.client.interceptors.response.use((response) => {
      const setCookie = response.headers['set-cookie'];
      if (setCookie) {
        this.mergeCookies(setCookie);
      }
      return response;
    });

    // Request interceptor: attach stored cookies
    this.client.interceptors.request.use((config) => {
      if (this.cookieString) {
        config.headers.set('Cookie', this.cookieString, false);
      }
      return config;
    });
  }

  /**
   * Initialize the session: GET the target URL to establish
   * JSESSIONID and extract the initial ViewState from the HTML.
   *
   * @param path - Optional path to GET (defaults to baseUrl)
   */
  async init(path?: string): Promise<void> {
    const url = path ? `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}` : this.baseUrl;
    const response = await this.client.get(url);
    this.viewState = HttpSession.extractViewStateFromHtml(response.data as string);
  }

  /**
   * Perform an AJAX POST to a JSF page.
   * Automatically includes the current ViewState in the payload.
   *
   * @param path - URL path (e.g. "/consultaTfa.xhtml")
   * @param data - Additional form data (dt_first, dt_rows, etc.)
   * @returns Axios response with the server reply
   */
  async post(path: string, data: Record<string, string>): Promise<AxiosResponse> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    const payload: Record<string, string> = {
      'javax.faces.partial.ajax': 'true',
      'javax.faces.source': data._formId || '',
      'javax.faces.partial.exec': data._formId || '',
      ...data,
    };

    // Include current ViewState if available
    if (this.viewState) {
      payload['javax.faces.ViewState'] = this.viewState;
    }

    // Remove internal meta-params
    delete payload._formId;

    // ponytail: URLSearchParams for application/x-www-form-urlencoded
    const response = await this.client.post(url, new URLSearchParams(payload), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Faces-Request': 'partial/ajax',
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'text/xml,application/xhtml+xml,text/html;q=0.9,*/*;q=0.8',
      },
      responseType: 'text',
    });

    return response;
  }

  /** Get the current javax.faces.ViewState value */
  getViewState(): string | null {
    return this.viewState;
  }

  /** Update the ViewState (called after parsing XML response) */
  updateViewState(newVs: string): void {
    this.viewState = newVs;
  }

  /** Get the current base URL */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Extract ViewState from a full HTML page.
   * Looks for `<input type="hidden" name="javax.faces.ViewState" value="..." />`.
   */
  static extractViewStateFromHtml(html: string): string | null {
    const $ = load(html);
    const vs = $('input[name="javax.faces.ViewState"]').val();
    return vs ? String(vs) : null;
  }

  /**
   * Merge Set-Cookie response headers into the cookie jar.
   * Preserves cookie names (last value wins for same name).
   */
  private mergeCookies(setCookie: string | string[]): void {
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    const existing = this.cookieString
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const raw of cookies) {
      const nameValue = raw.split(';')[0];
      if (!nameValue) continue;
      // Use indexOf to handle cookie values that contain '=' (e.g. JWT, base64)
      const eqIdx = nameValue.indexOf('=');
      if (eqIdx === -1) continue;
      const name = nameValue.slice(0, eqIdx).trim();

      // Remove old value for this cookie name, append new one
      const filtered = existing.filter((e) => {
        const idx = e.indexOf('=');
        return idx === -1 || e.slice(0, idx).trim() !== name;
      });
      filtered.push(nameValue.trim());
      this.cookieString = filtered.join('; ');
    }
  }
}
