/**
 * @file Pool de workers basado en semáforo para descargas PDF concurrentes.
 *
 * Gestiona un pool configurable de workers concurrentes, seguimiento
 * de estado por archivo y cola de trabajos. Una descarga fallida no
 * afecta a otros trabajos (aislamiento individual de fallos).
 */

import type { DownloadJob } from '../types.js';

/** Estado de descarga por archivo. */
export type DownloadStatus = 'pending' | 'downloading' | 'success' | 'failed';

/** Resultado de una descarga encolada. */
export interface DownloadResult {
  job: DownloadJob;
  status: DownloadStatus;
  error?: string;
  filePath?: string;
}

/** Tipo de la función工人 de descarga. La cola la llama por cada trabajo. */
export type DownloadWorker = (job: DownloadJob) => Promise<DownloadResult>;

/**
 * Cola de descargas basada en semáforo con concurrencia configurable.
 *
 * El tamaño del pool por defecto es 3 (rango 1–10). Los trabajos se
 * procesan en FIFO, y cada uno sigue el ciclo de vida:
 *   pendiente → descargando → éxito | fallo
 */
export class DownloadQueue {
  private readonly maxConcurrency: number;
  private activeCount = 0;
  private readonly queue: DownloadJob[] = [];
  private readonly results: DownloadResult[] = [];
  private worker: DownloadWorker;
  private resolveDone: (() => void) | null = null;

  /**
   * @param worker - Función asíncrona que realiza una descarga
   * @param concurrency - Máximo de descargas concurrentes (1–10, por defecto 3)
   */
  constructor(worker: DownloadWorker, concurrency = 3) {
    if (concurrency < 1 || concurrency > 10) {
      throw new Error(`Concurrency must be between 1 and 10, got ${concurrency}`);
    }
    this.maxConcurrency = concurrency;
    this.worker = worker;
  }

  /**
   * Añade uno o más trabajos de descarga a la cola.
   *
   * @param jobs - Trabajo único o array de trabajos
   */
  add(jobs: DownloadJob | DownloadJob[]): void {
    const items = Array.isArray(jobs) ? jobs : [jobs];
    for (const job of items) {
      this.queue.push(job);
      this.results.push({ job, status: 'pending' });
    }
    this.schedule();
  }

  /**
   * Espera a que todos los trabajos encolados terminen.
   *
   * @returns Array de resultados de descarga en orden de inserción
   */
  async wait(): Promise<DownloadResult[]> {
    if (this.activeCount === 0 && this.queue.length === 0) {
      return this.results;
    }
    return new Promise((resolve) => {
      this.resolveDone = () => resolve(this.results);
    });
  }

  /**
   * Programa el siguiente lote de workers desde la cola.
   */
  private schedule(): void {
    while (this.activeCount < this.maxConcurrency && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) break;

      this.activeCount++;
      const result = this.results.find(
        (r) => r.job.uuid === job.uuid && r.status === 'pending',
      );
      if (result) {
        result.status = 'downloading';
      }

      this.worker(job)
        .then((res) => {
          const idx = this.results.findIndex((r) => r.job.uuid === job.uuid);
          if (idx !== -1) {
            this.results[idx] = res;
          }
        })
        .catch((err: unknown) => {
          const idx = this.results.findIndex((r) => r.job.uuid === job.uuid);
          if (idx !== -1) {
            this.results[idx] = {
              job,
              status: 'failed',
              error: err instanceof Error ? err.message : String(err),
            };
          }
        })
        .finally(() => {
          this.activeCount--;
          this.schedule();
          if (this.activeCount === 0 && this.queue.length === 0) {
            this.resolveDone?.();
          }
        });
    }
  }
}
