/**
 * @file Descargador PDF con reintento, parseo de content-disposition
 * y sanitización de nombres de archivo.
 *
 * Descarga documentos PDF mediante POST con parámetros estilo
 * mojarra.jsfcljs. Maneja redirecciones, extrae nombres legibles
 * de la cabecera Content-Disposition y usa nombres basados en UUID
 * como fallback.
 *
 * Reintentos:
 * - Backoff exponencial con ±50% jitter (base 1000ms por defecto)
 * - Máximo 3 reintentos
 * - NO reintenta en HTTP 4xx (excepto 429 rate-limited)
 */

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { once } from 'node:events';
import * as path from 'node:path';
import axios from 'axios';

import type { DownloadJob } from '../types.js';

// ---------------------------------------------------------------------------
// Configuración de reintentos
// ---------------------------------------------------------------------------

/**
 * Opciones del descargador PDF.
 */
export interface DownloaderOptions {
  /** Retardo base de backoff en ms (por defecto: 1000) */
  backoffBaseMs?: number;
  /** Máximo de reintentos (por defecto: 3) */
  maxRetries?: number;
  /** Directorio de salida (por defecto: directorio actual) */
  outDir?: string;
}

const DEFAULTS: Required<DownloaderOptions> = {
  backoffBaseMs: 1000,
  maxRetries: 3,
  outDir: '.',
};

// ---------------------------------------------------------------------------
// Sanitización de nombres de archivo
// ---------------------------------------------------------------------------

/**
 * Mapa de reemplazo de caracteres para sanitizar nombres.
 *
 * Mapea caracteres especiales comunes en nombres de documentos
 * legales peruanos a equivalentes ASCII seguros.
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
 * Sanitiza un nombre de archivo reemplazando caracteres especiales
 * con alternativas seguras.
 *
 * @param name - Nombre crudo (sin ruta de directorio)
 * @returns Nombre sanitizado, seguro para cualquier sistema de archivos
 */
function sanitizeFilename(name: string): string {
  let result = '';
  for (const char of name) {
    result += SANITIZE_MAP[char] ?? char;
  }
  return result;
}

/**
 * Extrae el nombre de archivo del valor de una cabecera Content-Disposition.
 *
 * Soporta formatos `filename="..."` y `filename*=UTF-8''...`.
 * Devuelve el nombre crudo antes de sanitizar.
 *
 * @param headerValue - Cabecera Content-Disposition cruda
 * @returns Nombre extraído o null si la cabecera falta o no es parseable
 */
export function extractFilenameFromHeader(headerValue: string | null | undefined): string | null {
  if (!headerValue) return null;

  // Intentar filename* primero (RFC 5987)
  const starMatch = headerValue.match(/filename\*\s*=\s*(?:UTF-8|ISO-8859-1)''([^;\s]+)/i);
  if (starMatch?.[1]) {
    return decodeURIComponent(starMatch[1]);
  }

  // Intentar filename="..."
  const plainMatch = headerValue.match(/filename\s*=\s*"([^"]+)"/i);
  if (plainMatch?.[1]) return plainMatch[1];

  // Intentar filename=valor (sin comillas)
  const bareMatch = headerValue.match(/filename\s*=\s*([^;\s]+)/i);
  if (bareMatch?.[1]) return bareMatch[1];

  return null;
}

// ---------------------------------------------------------------------------
// Backoff
// ---------------------------------------------------------------------------

/**
 * Calcula el retardo de backoff con ±50% jitter.
 *
 * Fórmula: `delay = base * 2^attempt * (0.5 + Math.random())`
 *
 * @param baseMs - Retardo base en milisegundos
 * @param attempt - Índice del intento actual (base 0)
 * @returns Retardo en milisegundos (mínimo 1ms)
 */
export function calculateBackoff(baseMs: number, attempt: number): number {
  const exponential = baseMs * Math.pow(2, attempt);
  const jitter = 0.5 + Math.random(); // 0.5 a 1.5
  return Math.max(1, Math.round(exponential * jitter));
}

// ---------------------------------------------------------------------------
// Descarga principal
// ---------------------------------------------------------------------------

/**
 * Construye el payload POST para una solicitud de descarga JSF PDF.
 *
 * Usa parámetros estilo mojarra.jsfcljs:
 * - javax.faces.source: componente fuente (ID del formulario)
 * - javax.faces.partial: false (petición de página completa)
 * - javax.faces.ViewState: ViewState opcional de la sesión
 * - param_uuid: UUID del documento
 *
 * @param job - Trabajo de descarga con UUID y parámetros de formulario
 * @returns URLSearchParams para el cuerpo del POST
 */
function buildDownloadPayload(job: DownloadJob): URLSearchParams {
  const params: Record<string, string> = {
    'javax.faces.source': job.formParams._formId || job.formParams['javax.faces.source'] || '',
    'javax.faces.partial': 'false',
    param_uuid: job.uuid,
  };

  for (const [key, value] of Object.entries(job.formParams)) {
    if (key !== '_formId' && !params[key]) {
      params[key] = value;
    }
  }

  return new URLSearchParams(params);
}

/**
 * Descarga un único archivo PDF con lógica de reintento.
 *
 * @param job - Especificación del trabajo de descarga
 * @param options - Opciones del descargador (backoff, reintentos, directorio)
 * @returns Ruta del archivo donde se guardó el PDF
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

      // No reintentar en 4xx excepto 429 (rate-limited)
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
 * Intenta una descarga sin lógica de reintento.
 *
 * @returns Ruta del archivo guardado
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
    validateStatus: (status) => (status >= 200 && status < 300) || [301, 302, 307, 308].includes(status),
  });

  // Determinar nombre de archivo
  const contentDisposition = response.headers['content-disposition'] as string | undefined;
  let filename = extractFilenameFromHeader(contentDisposition ?? null);

  if (!filename) {
    // Fallback a nombre basado en UUID
    filename = `${job.uuid}.pdf`;
    console.warn(
      `[downloader] No Content-Disposition header for ${job.uuid}, using fallback "${filename}"`,
    );
  }

  // Sanitizar y asegurar extensión .pdf
  const sanitized = sanitizeFilename(filename);
  const finalName = sanitized.toLowerCase().endsWith('.pdf') ? sanitized : `${sanitized}.pdf`;
  const filePath = path.join(outDir, finalName);

  // Escribir a disco
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
 * Verifica si un error representa un HTTP 4xx no reintentable (excepto 429).
 * También detecta el error envuelto de axios para códigos de estado HTTP.
 */
export function isNonRetryable4xx(error: unknown): boolean {
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
 * Descarga un PDF y envuelve el resultado para consumo por la cola.
 *
 * @param job - Trabajo de descarga
 * @param options - Opciones del descargador
 * @returns DownloadResult con estado y ruta
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
