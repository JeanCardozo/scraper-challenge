import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { load } from 'cheerio';

/**
 * Gestiona una sesión HTTP con un servidor JSF.
 *
 * Responsabilidades:
 * - Establecer JSESSIONID mediante GET inicial
 * - Extraer y rotar javax.faces.ViewState
 * - Mantener cookies vía interceptores de axios
 */
export class HttpSession {
  private client: AxiosInstance;
  private viewState: string | null = null;
  private baseUrl: string;
  private cookieString = '';

  /**
   * @param baseUrl - URL base del servidor destino (sin barra final)
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

    // Interceptor de respuesta: captura Set-Cookie
    this.client.interceptors.response.use((response) => {
      const setCookie = response.headers['set-cookie'];
      if (setCookie) {
        this.mergeCookies(setCookie);
      }
      return response;
    });

    // Interceptor de petición: adjunta cookies almacenadas
    this.client.interceptors.request.use((config) => {
      if (this.cookieString) {
        config.headers.set('Cookie', this.cookieString, false);
      }
      return config;
    });
  }

  /**
   * Inicializa la sesión: GET a la URL destino para establecer
   * JSESSIONID y extraer el ViewState inicial del HTML.
   *
   * @param path - Ruta opcional para el GET (por defecto baseUrl)
   */
  async init(path?: string): Promise<void> {
    const url = path ? `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}` : this.baseUrl;
    const response = await this.client.get(url);
    this.viewState = HttpSession.extractViewStateFromHtml(response.data as string);
  }

  /**
   * Realiza un POST AJAX a una página JSF.
   * Incluye automáticamente el ViewState actual en el payload.
   *
   * @param path - Ruta (ej. "/consultaTfa.xhtml")
   * @param data - Datos adicionales del formulario (dt_first, dt_rows, etc.)
   * @returns Respuesta de axios con la respuesta del servidor
   */
  async post(path: string, data: Record<string, string>): Promise<AxiosResponse> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    const payload: Record<string, string> = {
      'javax.faces.partial.ajax': 'true',
      'javax.faces.source': data._formId || '',
      'javax.faces.partial.exec': data._formId || '',
      ...data,
    };

    if (this.viewState) {
      payload['javax.faces.ViewState'] = this.viewState;
    }

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

  /** Devuelve el javax.faces.ViewState actual */
  getViewState(): string | null {
    return this.viewState;
  }

  /** Actualiza el ViewState (llamado tras parsear respuesta XML) */
  updateViewState(newVs: string): void {
    this.viewState = newVs;
  }

  /** Devuelve la URL base actual */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Extrae el ViewState de una página HTML completa.
   * Busca `<input type="hidden" name="javax.faces.ViewState" value="..." />`.
   */
  static extractViewStateFromHtml(html: string): string | null {
    const $ = load(html);
    const vs = $('input[name="javax.faces.ViewState"]').val();
    return vs ? String(vs) : null;
  }

  /**
   * Fusiona cabeceras Set-Cookie en el jar de cookies.
   * Conserva nombres de cookie (el último valor gana para el mismo nombre).
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
      // indexOf porque el valor puede contener '=' (JWT, base64)
      const eqIdx = nameValue.indexOf('=');
      if (eqIdx === -1) continue;
      const name = nameValue.slice(0, eqIdx).trim();

      const filtered = existing.filter((e) => {
        const idx = e.indexOf('=');
        return idx === -1 || e.slice(0, idx).trim() !== name;
      });
      filtered.push(nameValue.trim());
      this.cookieString = filtered.join('; ');
    }
  }
}
