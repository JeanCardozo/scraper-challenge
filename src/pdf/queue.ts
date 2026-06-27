/**
 * @file Semaphore-based worker pool for concurrent PDF downloads.
 *
 * Manages a configurable pool of concurrent workers, per-file status
 * tracking, and job queueing. A single failed download does not affect
 * other jobs in the pool (individual failure isolation).
 */

import type { DownloadJob } from '../types.js';

/**
 * Per-file download status.
 */
export type DownloadStatus = 'pending' | 'downloading' | 'success' | 'failed';

/**
 * Result for a single queued download.
 */
export interface DownloadResult {
  job: DownloadJob;
  status: DownloadStatus;
  error?: string;
  filePath?: string;
}

/**
 * Type for the actual download worker function.
 * The queue calls this for each job, respecting concurrency limits.
 */
export type DownloadWorker = (job: DownloadJob) => Promise<DownloadResult>;

/**
 * Semaphore-based download queue with configurable concurrency.
 *
 * Default pool size is 3 (range 1–10). Jobs are processed FIFO,
 * and each job is tracked with a status lifecycle:
 *   pending → downloading → success | failed
 */
export class DownloadQueue {
  private readonly maxConcurrency: number;
  private activeCount = 0;
  private readonly queue: DownloadJob[] = [];
  private readonly results: DownloadResult[] = [];
  private worker: DownloadWorker;
  private resolveDone: (() => void) | null = null;

  /**
   * @param worker - Async function that performs a single download
   * @param concurrency - Max concurrent downloads (1–10, default 3)
   */
  constructor(worker: DownloadWorker, concurrency = 3) {
    if (concurrency < 1 || concurrency > 10) {
      throw new Error(`Concurrency must be between 1 and 10, got ${concurrency}`);
    }
    this.maxConcurrency = concurrency;
    this.worker = worker;
  }

  /**
   * Add one or more download jobs to the queue.
   *
   * @param jobs - Single job or array of jobs
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
   * Wait for all queued jobs to complete.
   *
   * @returns Array of download results in submission order
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
   * Schedule next batch of workers from the queue.
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
