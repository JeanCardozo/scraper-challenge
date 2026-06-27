import type { SiteAdapter, SectionConfig, ScrapedRecord } from '../types.js';
import { HttpSession } from './session.js';
import { JsfXmlParser } from './xml-parser.js';

/**
 * PrimeFaces AJAX parameter names used in pagination requests.
 * Grouped here so a single edit adapts the engine to different
 * PrimeFaces versions or custom widget naming.
 */
const PF_PARAMS = {
  /** Partial AJAX marker */
  PARTIAL_AJAX: 'javax.faces.partial.ajax',
  /** Partial render target list */
  PARTIAL_RENDER: 'javax.faces.partial.render',
  /** Behavior event type */
  BEHAVIOR_EVENT: 'javax.faces.behavior.event',
  /** JSF phase event */
  EVENT: 'javax.faces.event',
  /** PrimeFaces context type */
  PF_CONTEXT: 'org.primefaces.faces.context',
  /** Pagination context value */
  PF_CONTEXT_PAGE: 'PAGE',
  /** Behavior page event value */
  BEHAVIOR_PAGE: 'page',
  /** Event page value */
  EVENT_PAGE: 'page',
  /** Pagination flag suffix */
  PAGINATION_SUFFIX: '_pagination',
  /** Offset param suffix */
  FIRST_SUFFIX: '_first',
  /** Page size param suffix */
  ROWS_SUFFIX: '_rows',
  /** Legacy dt_first param */
  DT_FIRST: 'dt_first',
  /** Legacy dt_rows param */
  DT_ROWS: 'dt_rows',
  /** Legacy dt_page param */
  DT_PAGE: 'dt_page',
} as const;

/**
 * Configuration options for the scraper engine.
 */
export interface EngineOptions {
  /** Maximum retry attempts per page (default: 3) */
  maxRetries?: number;
  /** Maximum pages to scrape per section (default: Infinity) */
  maxPages?: number;
  /** Base backoff delay in ms (default: 1000) */
  backoffBaseMs?: number;
  /** Whether to stop on stale-session detection (default: true) */
  abortOnStaleSession?: boolean;
}

/**
 * Default engine option values.
 */
const DEFAULTS: Required<EngineOptions> = {
  maxRetries: 3,
  maxPages: Infinity,
  backoffBaseMs: 1000,
  abortOnStaleSession: true,
};

/**
 * Core paginated scraping engine for JSF/PrimeFaces DataTables.
 *
 * Orchestrates offset-based pagination with ViewState rotation,
 * configurable retry with jittered exponential backoff, stale
 * session detection, and per-page failure isolation.
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
   * Scrape all records from a given section.
   *
   * Iterates through pages using offset-based pagination,
   * handling ViewState rotation, retries, and error isolation
   * automatically.
   *
   * @param section - Section configuration to scrape
   * @returns Array of scraped records
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
        // Per-page failure after exhausting retries — isolate and continue
        offset += section.pageSize;
        pageCount++;
        continue;
      }

      if (pageRecords.length === 0) {
        // Empty set — pagination complete
        break;
      }

      records.push(...pageRecords);
      offset += section.pageSize;
      pageCount++;
    }

    return records;
  }

  /**
   * Build form-data payload for a PrimeFaces pagination request.
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
   * Fetch a single page with retry logic and backoff.
   *
   * @returns ScrapedRecord[] for the page, or null if all retries failed
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

        // Stale session detection
        if (this.options.abortOnStaleSession && this.isStaleSession(xml)) {
          throw new StaleSessionError(
            `Session expired while scraping ${section.key} at offset ${offset}`,
          );
        }

        // Extract new ViewState from response
        const newVs = this.xmlParser.extractViewState(xml);
        if (newVs) {
          this.session.updateViewState(newVs);
        }

        // Parse rows from CDATA
        const rows = this.xmlParser.parseRows(xml);
        if (!rows || rows.length === 0) {
          return [];
        }

        // Map rows through adapter
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

        // Re-throw stale session errors immediately
        if (error instanceof StaleSessionError) {
          throw error;
        }

        if (attempt < this.options.maxRetries) {
          await this.backoff(attempt);
        }
      }
    }

    // All retries exhausted — log and return null for isolation
    console.warn(
      `[engine] Page ${pageIndex} (offset ${offset}) failed after ${this.options.maxRetries + 1} attempts: ${lastError?.message}`,
    );
    return null;
  }

  /**
   * Exponential backoff with ±50% jitter.
   *
   * delay = base * 2^attempt * (0.5 + Math.random())
   * This ensures each retry waits longer but with randomized
   * variance to avoid thundering herd.
   */
  private async backoff(attempt: number): Promise<void> {
    const base = this.options.backoffBaseMs;
    const exponential = base * Math.pow(2, attempt);
    const jitter = 0.5 + Math.random(); // 0.5 to 1.5
    const delay = Math.max(1, Math.round(exponential * jitter));
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Detect stale session by checking if response contains
   * login page indicators (login form, redirect patterns).
   *
   * Uses \b word boundaries to avoid false positives from
   * unrelated text containing "login" or "form" substrings.
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
 * Error thrown when the JSF session expires mid-scrape.
 */
export class StaleSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaleSessionError';
  }
}
