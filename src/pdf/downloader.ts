/**
 * @file PDF downloader with retry, content-disposition parsing, and
 * filename sanitization.
 *
 * Downloads PDF documents via form POST using mojarra.jsfcljs-style
 * parameters. Handles redirects, extracts human-readable filenames
 * from the Content-Disposition header, and falls back to UUID-based
 * filenames when the header is absent.
 *
 * Retry behavior:
 * - Exponential backoff with ±50% jitter (default base 1000ms)
 * - Maximum 3 retries
 * - Does NOT retry on HTTP 4xx errors (except 429 rate-limited)
 */

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { once } from 'node:events';
import * as path from 'node:path';
import axios from 'axios';

import type { DownloadJob } from '../types.js';

// ---------------------------------------------------------------------------
// Retry configuration
// ---------------------------------------------------------------------------

/**
 * Options for the PDF downloader.
 */
export interface DownloaderOptions {
  /** Base backoff delay in ms (default: 1000) */
  backoffBaseMs?: number;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Output directory for downloaded files (default: current dir) */
  outDir?: string;
}

const DEFAULTS: Required<DownloaderOptions> = {
  backoffBaseMs: 1000,
  maxRetries: 3,
  outDir: '.',
};

// ---------------------------------------------------------------------------
// Filename sanitization
// ---------------------------------------------------------------------------

/**
 * Character replacement map for sanitizing filenames.
 *
 * Maps special characters commonly found in Peruvian legal document
 * filenames to safe ASCII equivalents.
 */
const SANITIZE_MAP: Record<string, string> = {
  '°': 'o',
  'º': 'o',
  'ñ': 'n',
  'Ñ': 'N',
  ' ': '_',
  '/': '_',
  '\\': '_',
  ':': '_',
  '*': '_',
  '?': '_',
  '"': '_',
  '<': '_',
  '>': '_',
  '|': '_',
};

/**
 * Sanitize a filename by replacing special characters with safe
 * alternatives.
 *
 * @param name - Raw filename (without directory path)
 * @returns Sanitized filename safe for all major filesystems
 */
function sanitizeFilename(name: string): string {
  let result = '';
  for (const char of name) {
    result += SANITIZE_MAP[char] ?? char;
  }
  return result;
}

/**
 * Extract a filename from a Content-Disposition header value.
 *
 * Handles both `filename="..."` and `filename*=UTF-8''...` formats.
 * Returns the raw filename before sanitization.
 *
 * @param headerValue - Raw Content-Disposition header string
 * @returns Extracted filename or null if header is missing/unparseable
 */
function extractFilenameFromHeader(headerValue: string | null | undefined): string | null {
  if (!headerValue) return null;

  // Try filename* first (RFC 5987 encoded)
  const starMatch = headerValue.match(/filename\*\s*=\s*(?:UTF-8|ISO-8859-1)''([^;\s]+)/i);
  if (starMatch?.[1]) {
    return decodeURIComponent(starMatch[1]);
  }

  // Try regular filename="..."
  const plainMatch = headerValue.match(/filename\s*=\s*"([^"]+)"/i);
  if (plainMatch?.[1]) return plainMatch[1];

  // Try bare filename=value (without quotes)
  const bareMatch = headerValue.match(/filename\s*=\s*([^;\s]+)/i);
  if (bareMatch?.[1]) return bareMatch[1];

  return null;
}

// ---------------------------------------------------------------------------
// Backoff
// ---------------------------------------------------------------------------

/**
 * Calculate backoff delay with ±50% jitter.
 *
 * Formula: `delay = base * 2^attempt * (0.5 + Math.random())`
 *
 * @param baseMs - Base delay in milliseconds
 * @param attempt - Current retry attempt index (0-based)
 * @returns Delay in milliseconds (minimum 1ms)
 */
export function calculateBackoff(baseMs: number, attempt: number): number {
  const exponential = baseMs * Math.pow(2, attempt);
  const jitter = 0.5 + Math.random(); // 0.5 to 1.5
  return Math.max(1, Math.round(exponential * jitter));
}

// ---------------------------------------------------------------------------
// Main download function
// ---------------------------------------------------------------------------

/**
 * Build the form POST payload for a JSF PDF download request.
 *
 * Uses mojarra.jsfcljs-style parameters:
 * - javax.faces.source: the source component (form ID)
 * - javax.faces.partial: false (full page request)
 * - javax.faces.ViewState: optional ViewState from session
 * - param_uuid: the document UUID
 *
 * @param job - Download job with UUID and form params
 * @returns URLSearchParams for the POST body
 */
function buildDownloadPayload(job: DownloadJob): URLSearchParams {
  const params: Record<string, string> = {
    'javax.faces.source': job.formParams._formId || job.formParams['javax.faces.source'] || '',
    'javax.faces.partial': 'false',
    param_uuid: job.uuid,
  };

  // Forward any extra form params from the adapter
  for (const [key, value] of Object.entries(job.formParams)) {
    if (key !== '_formId' && !params[key]) {
      params[key] = value;
    }
  }

  return new URLSearchParams(params);
}

/**
 * Download a single PDF file with retry logic.
 *
 * @param job - Download job specification
 * @param options - Downloader options (backoff, retries, output dir)
 * @returns The file path where the PDF was saved
 */
export async function downloadPdf(
  job: DownloadJob,
  options: DownloaderOptions = {},
): Promise<string> {
  const opts = { ...DEFAULTS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await attemptDownload(job, opts.outDir);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Do not retry on 4xx except 429 (rate-limited)
      if (isNonRetryable4xx(error)) {
        console.warn(
          `[downloader] Non-retryable error for ${job.uuid}: ${lastError.message}`,
        );
        throw lastError;
      }

      if (attempt < opts.maxRetries) {
        const delay = calculateBackoff(opts.backoffBaseMs, attempt);
        console.warn(
          `[downloader] Retry ${attempt + 1}/${opts.maxRetries} for ${job.uuid} after ${delay}ms: ${lastError.message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError ?? new Error(`Download failed for ${job.uuid}`);
}

/**
 * Attempt a single download without retry logic.
 *
 * @returns The saved file path
 */
async function attemptDownload(job: DownloadJob, outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true });

  const payload = buildDownloadPayload(job);

  const response = await axios.post(job.url, payload.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'Mozilla/5.0 (compatible; JSF-Scraper/1.0)',
    },
    responseType: 'arraybuffer',
    maxRedirects: 10,
    timeout: 30_000,
    // Validate status: accept any 2xx or redirect
    validateStatus: (status) => (status >= 200 && status < 300) || [301, 302, 307, 308].includes(status),
  });

  // Determine filename
  const contentDisposition = response.headers['content-disposition'] as string | undefined;
  let filename = extractFilenameFromHeader(contentDisposition ?? null);

  if (!filename) {
    // Fallback to UUID-based filename
    filename = `${job.uuid}.pdf`;
    console.warn(
      `[downloader] No Content-Disposition header for ${job.uuid}, using fallback "${filename}"`,
    );
  }

  // Sanitize and ensure .pdf extension
  const sanitized = sanitizeFilename(filename);
  const finalName = sanitized.toLowerCase().endsWith('.pdf') ? sanitized : `${sanitized}.pdf`;
  const filePath = path.join(outDir, finalName);

  // Write to disk
  const stream = createWriteStream(filePath);
  try {
    stream.write(Buffer.from(response.data as ArrayBuffer));
  } finally {
    stream.end();
    await once(stream, 'finish');
  }

  console.log(`[downloader] Saved ${job.uuid} → ${finalName}`);

  return filePath;
}

/**
 * Check if an error represents a non-retryable HTTP 4xx (except 429).
 * Also matches axios' error-wrapping for HTTP status codes.
 */
function isNonRetryable4xx(error: unknown): boolean {
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosErr = error as { response?: { status?: number } };
    const status = axiosErr.response?.status;
    if (status && status >= 400 && status < 500 && status !== 429) {
      return true;
    }
  }
  return false;
}

/**
 * Download a single PDF and wrap the result for queue consumption.
 *
 * @param job - Download job
 * @param options - Downloader options
 * @returns DownloadResult with status and file path
 */
export async function queueableDownload(
  job: DownloadJob,
  options?: DownloaderOptions,
): Promise<import('./queue.js').DownloadResult> {
  try {
    const filePath = await downloadPdf(job, options);
    return { job, status: 'success', filePath };
  } catch (error) {
    return {
      job,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
