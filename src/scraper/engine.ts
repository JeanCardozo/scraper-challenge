import type { SiteAdapter, SectionConfig, ScrapedRecord } from '../types.js';
import { HttpSession } from './session.js';
import { JsfXmlParser } from './xml-parser.js';

/**
 * Parámetros de paginación AJAX de PrimeFaces.
 * Agrupados aquí para adaptar el motor a diferentes versiones
 * de PrimeFaces o nombres de widget personalizados.
 */
const PF_PARAMS = {
  /** Marcador de petición parcial AJAX */
  PARTIAL_AJAX: 'javax.faces.partial.ajax',
  /** Lista de destinos de renderizado parcial */
  PARTIAL_RENDER: 'javax.faces.partial.render',
  /** Tipo de evento de comportamiento */
  BEHAVIOR_EVENT: 'javax.faces.behavior.event',
  /** Evento de fase JSF */
  EVENT: 'javax.faces.event',
  /** Contexto PrimeFaces */
  PF_CONTEXT: 'org.primefaces.faces.context',
  /** Valor de contexto de paginación */
  PF_CONTEXT_PAGE: 'PAGE',
  /** Valor de evento de página del comportamiento */
  BEHAVIOR_PAGE: 'page',
  /** Valor de evento de página */
  EVENT_PAGE: 'page',
  /** Sufijo del flag de paginación */
  PAGINATION_SUFFIX: '_pagination',
  /** Sufijo del parámetro de offset */
  FIRST_SUFFIX: '_first',
  /** Sufijo del parámetro de tamaño de página */
  ROWS_SUFFIX: '_rows',
  /** Parámetro legacy dt_first */
  DT_FIRST: 'dt_first',
  /** Parámetro legacy dt_rows */
  DT_ROWS: 'dt_rows',
  /** Parámetro legacy dt_page */
  DT_PAGE: 'dt_page',
} as const;

/**
 * Opciones de configuración del motor de scraping.
 */
export interface EngineOptions {
  /** Máximo de reintentos por página (por defecto: 3) */
  maxRetries?: number;
  /** Máximo de páginas a extraer por sección (por defecto: infinito) */
  maxPages?: number;
  /** Retardo base de backoff en ms (por defecto: 1000) */
  backoffBaseMs?: number;
  /** Detener en sesión expirada (por defecto: true) */
  abortOnStaleSession?: boolean;
}

/**
 * Valores por defecto de las opciones del motor.
 */
const DEFAULTS: Required<EngineOptions> = {
  maxRetries: 3,
  maxPages: Infinity,
  backoffBaseMs: 1000,
  abortOnStaleSession: true,
};

/**
 * Motor de scraping paginado para DataTables JSF/PrimeFaces.
 *
 * Orquesta la paginación por offset con rotación de ViewState,
 * reintentos configurables con backoff exponencial con jitter,
 * detección de sesión expirada y aislamiento de errores por página.
 */
export class ScraperEngine {
  private adapter: SiteAdapter;
  private session: HttpSession;
  private xmlParser: JsfXmlParser;
  private options: Required<EngineOptions>;

  constructor(
    adapter: SiteAdapter,
    session: HttpSession,
    options: EngineOptions = {},
  ) {
    this.adapter = adapter;
    this.session = session;
    this.xmlParser = new JsfXmlParser();
    this.options = { ...DEFAULTS, ...options };
  }

  /**
   * Extrae todos los registros de una sección.
   *
   * Itera las páginas usando paginación por offset, manejando
   * rotación de ViewState, reintentos y aislamiento de errores.
   *
   * @param section - Configuración de la sección a scrapear
   * @returns Array de registros extraídos
   */
  async scrapeSection(section: SectionConfig): Promise<ScrapedRecord[]> {
    const records: ScrapedRecord[] = [];
    let offset = 0;
    let pageCount = 0;

    while (pageCount < this.options.maxPages) {
      const pageRecords = await this.fetchPageWithRetry(
        section, offset, section.pageSize, pageCount,
      );

      if (pageRecords === null) {
        // Falla página tras agotar reintentos — aislar y continuar
        offset += section.pageSize;
        pageCount++;
        continue;
      }

      if (pageRecords.length === 0) {
        // Conjunto vacío — paginación completada
        break;
      }

      records.push(...pageRecords);
      offset += section.pageSize;
      pageCount++;
    }

    return records;
  }

  /**
   * Construye el payload del formulario para una petición de paginación PrimeFaces.
   */
  private buildPaginationPayload(
    section: SectionConfig,
    offset: number,
    pageSize: number,
  ): Record<string, string> {
    const wv = section.widgetVar;
    return {
      _formId: section.formId,
      [wv]: wv,
      [`${wv}${PF_PARAMS.PAGINATION_SUFFIX}`]: 'true',
      [`${wv}${PF_PARAMS.FIRST_SUFFIX}`]: String(offset),
      [`${wv}${PF_PARAMS.ROWS_SUFFIX}`]: String(pageSize),
      [PF_PARAMS.PARTIAL_RENDER]: section.formId,
      [PF_PARAMS.BEHAVIOR_EVENT]: PF_PARAMS.BEHAVIOR_PAGE,
      [PF_PARAMS.EVENT]: PF_PARAMS.EVENT_PAGE,
      [PF_PARAMS.PF_CONTEXT]: PF_PARAMS.PF_CONTEXT_PAGE,
      [PF_PARAMS.DT_FIRST]: String(offset),
      [PF_PARAMS.DT_ROWS]: String(pageSize),
      [PF_PARAMS.DT_PAGE]: String(Math.floor(offset / pageSize) + 1),
    };
  }

  /**
   * Obtiene una página con lógica de reintento y backoff.
   *
   * @returns ScrapedRecord[] de la página, o null si todos los reintentos fallaron
   */
  private async fetchPageWithRetry(
    section: SectionConfig,
    offset: number,
    pageSize: number,
    pageIndex: number,
  ): Promise<ScrapedRecord[] | null> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        const data = this.buildPaginationPayload(section, offset, pageSize);

        const response = await this.session.post(section.path, data);
        const xml = response.data as string;

        // Detección de sesión expirada
        if (this.options.abortOnStaleSession && this.isStaleSession(xml)) {
          throw new StaleSessionError(
            `Session expired while scraping ${section.key} at offset ${offset}`,
          );
        }

        // Extraer nuevo ViewState de la respuesta
        const newVs = this.xmlParser.extractViewState(xml);
        if (newVs) {
          this.session.updateViewState(newVs);
        }

        // Parsear filas del CDATA
        const rows = this.xmlParser.parseRows(xml);
        if (!rows || rows.length === 0) {
          return [];
        }

        const pageRecords: ScrapedRecord[] = [];
        rows.each((idx) => {
          const $row = rows.eq(idx);
          const record = this.adapter.parseRow($row);
          if (record) {
            record._section = section.key;
            pageRecords.push(record);
          }
        });

        return pageRecords;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Re-lanzar errores de sesión expirada inmediatamente
        if (error instanceof StaleSessionError) {
          throw error;
        }

        if (attempt < this.options.maxRetries) {
          await this.backoff(attempt);
        }
      }
    }

    // Reintentos agotados — log y null para aislamiento
    console.warn(
      `[engine] Page ${pageIndex} (offset ${offset}) failed after ${this.options.maxRetries + 1} attempts: ${lastError?.message}`,
    );
    return null;
  }

  /**
   * Backoff exponencial con ±50% jitter.
   *
   * delay = base * 2^attempt * (0.5 + Math.random())
   * Aleatorizado para evitar el efecto thundering herd.
   */
  private async backoff(attempt: number): Promise<void> {
    const base = this.options.backoffBaseMs;
    const exponential = base * Math.pow(2, attempt);
    const jitter = 0.5 + Math.random(); // 0.5 a 1.5
    const delay = Math.max(1, Math.round(exponential * jitter));
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Detecta sesión expirada verificando si la respuesta contiene
   * indicadores de página de login (formulario de login, patrones de redirect).
   *
   * Usa \b para evitar falsos positivos con texto que contenga "login" o "form".
   */
  public isStaleSession(xml: string): boolean {
    const loginPatterns = [
      /\bj_username\b/i,
      /\bj_password\b/i,
      /\bloginForm\b/i,
      /\bIniciar Sesión\b/i,
    ];

    return loginPatterns.some((pattern) => pattern.test(xml));
  }
}

/**
 * Error lanzado cuando la sesión JSF expira durante el scraping.
 */
export class StaleSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaleSessionError';
  }
}
