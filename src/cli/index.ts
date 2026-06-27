#!/usr/bin/env node
/**
 * @file CLI entry point for the JSF/PrimeFaces site scraper.
 *
 * Usage:
 *   npx tsx src/cli/index.ts <section> <out-dir> [options]
 *
 * Sections:
 *   tfa   - Tribunal de Fiscalización Ambiental
 *   dfsai - Dirección de Fiscalización Sanción y Asuntos de Impacto
 *   iga   - Instrumentos de Gestión Ambiental
 *   all   - Scrape all three sections
 *
 * Options:
 *   --resume         Skip existing JSONL/CSV files, retry only failed downloads
 *   --concurrency N  PDF download concurrency (1–10, default 3)
 *   --help           Show this help message
 *
 * Phase orchestration:
 *   1. Scrape metadata records via paginated AJAX
 *   2. Export to JSON Lines + CSV
 *   3. Download PDFs using extracted UUIDs
 */

import { existsSync } from 'node:fs';
import * as path from 'node:path';

import type { ScrapedRecord, DownloadJob } from '../types.js';
import { ScraperEngine, StaleSessionError } from '../scraper/engine.js';
import { HttpSession } from '../scraper/session.js';
import { OefaAdapter } from '../oefa/adapter.js';
import { writeJsonLines } from '../export/json.js';
import { writeCsv } from '../export/csv.js';
import { DownloadQueue } from '../pdf/queue.js';
import { queueableDownload } from '../pdf/downloader.js';

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

const HELP = `
Usage: npx tsx src/cli/index.ts <section> <out-dir> [options]

Scrape JSF/PrimeFaces public consultation tables and download associated PDFs.

Sections:
  tfa       Tribunal de Fiscalización Ambiental
  dfsai     Dirección de Fiscalización Sanción y Asuntos de Impacto
  iga       Instrumentos de Gestión Ambiental
  all       Scrape all three sections

Options:
  --resume          Skip existing JSONL/CSV files; retry only failed downloads
  --concurrency N   PDF download pool size (1–10, default 3)
  --help            Show this help message

Examples:
  npx tsx src/cli/index.ts tfa ./out
  npx tsx src/cli/index.ts dfsai ./out --concurrency 5
  npx tsx src/cli/index.ts all ./out --resume
`;

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(HELP);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface CliOptions {
  section: string;
  outDir: string;
  resume: boolean;
  concurrency: number;
}

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    // unreachable
  }

  const section = args[0]?.toLowerCase();
  if (!section || !['tfa', 'dfsai', 'iga', 'all'].includes(section)) {
    console.error(`Invalid section "${section}". Valid options: tfa, dfsai, iga, all`);
    process.exit(1);
  }

  const outDir = args[1] || '.';

  const resume = args.includes('--resume');
  const concurrencyIdx = args.indexOf('--concurrency');
  let concurrency = 3;
  if (concurrencyIdx !== -1 && args[concurrencyIdx + 1]) {
    const parsed = parseInt(args[concurrencyIdx + 1]!, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 10) {
      console.error('--concurrency must be a number between 1 and 10');
      process.exit(1);
    }
    concurrency = parsed;
  }

  return { section, outDir, resume, concurrency };
}

// ---------------------------------------------------------------------------
// Section resolution
// ---------------------------------------------------------------------------

function resolveSections(adapter: OefaAdapter, sectionArg: string): string[] {
  if (sectionArg === 'all') {
    return adapter.sections.map((s) => s.key);
  }
  const config = adapter.getSection(sectionArg);
  if (!config) {
    console.error(`Unknown section "${sectionArg}". Valid sections: ${adapter.sections.map((s) => s.key).join(', ')}`);
    process.exit(1);
  }
  return [sectionArg];
}

// ---------------------------------------------------------------------------
// Phase 1: Scrape a single section
// ---------------------------------------------------------------------------

async function scrapeSection(
  adapter: OefaAdapter,
  sectionKey: string,
): Promise<ScrapedRecord[]> {
  const section = adapter.getSection(sectionKey);
  if (!section) {
    console.error(`[scraper] Unknown section: ${sectionKey}`);
    return [];
  }

  adapter.useSection(sectionKey);
  const session = new HttpSession(adapter.baseUrl);
  const engine = new ScraperEngine(adapter, session);

  console.log(`\n[scraper] Scraping section "${section.label}" from ${adapter.baseUrl}${section.path}`);

  try {
    await session.init(section.path);
    console.log('[scraper] Session established, ViewState extracted');
  } catch (error) {
    console.error(`[scraper] Failed to initialize session: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }

  try {
    const records = await engine.scrapeSection(section);
    console.log(`[scraper] Section "${section.label}": ${records.length} records scraped`);
    return records;
  } catch (error) {
    if (error instanceof StaleSessionError) {
      console.error(`[scraper] Session expired mid-scrape for "${section.label}": ${error.message}`);
    } else {
      console.error(`[scraper] Error scraping "${section.label}": ${error instanceof Error ? error.message : String(error)}`);
    }
    return [];
  }
}

// ---------------------------------------------------------------------------
// Phase 2: Export
// ---------------------------------------------------------------------------

async function exportRecords(
  records: ScrapedRecord[],
  sectionKey: string,
  outDir: string,
  resume: boolean,
): Promise<void> {
  const jsonPath = path.join(outDir, `${sectionKey}.jsonl`);
  const csvPath = path.join(outDir, `${sectionKey}.csv`);

  const jsonExists = existsSync(jsonPath);
  const csvExists = existsSync(csvPath);

  // In resume mode, skip if both files exist
  if (resume && jsonExists && csvExists) {
    console.log(`[export] Skipping ${sectionKey} — files already exist (--resume)`);
    return;
  }

  const append = resume; // Append mode when resuming

  if (!resume || !jsonExists) {
    await writeJsonLines(records, jsonPath, { append });
    console.log(`[export] Wrote ${records.length} records to ${jsonPath}`);
  } else {
    console.log(`[export] Skipped ${jsonPath} (already exists, --resume)`);
  }

  if (!resume || !csvExists) {
    await writeCsv(records, csvPath, { append });
    console.log(`[export] Wrote ${records.length} records to ${csvPath}`);
  } else {
    console.log(`[export] Skipped ${csvPath} (already exists, --resume)`);
  }
}

// ---------------------------------------------------------------------------
// Phase 3: Download PDFs
// ---------------------------------------------------------------------------

interface PdfStats {
  total: number;
  skipped: number;
  success: number;
  failed: number;
}

async function downloadPdfs(
  records: ScrapedRecord[],
  adapter: OefaAdapter,
  sectionKey: string,
  outDir: string,
  concurrency: number,
  resume: boolean,
): Promise<PdfStats> {
  // Build download jobs from records
  const jobs: DownloadJob[] = [];
  for (const record of records) {
    adapter.useSection(sectionKey);
    const job = adapter.extractDownloadParams(record);
    if (job) {
      jobs.push(job);
    }
  }

  if (jobs.length === 0) {
    console.log(`[download] No PDF download URLs found in section "${sectionKey}"`);
    return { total: 0, skipped: 0, success: 0, failed: 0 };
  }

  console.log(`[download] ${jobs.length} PDF(s) queued (concurrency: ${concurrency})`);

  // Resume: filter out already-downloaded UUIDs
  let filteredJobs = jobs;
  if (resume) {
    const existing = new Set<string>();
    for (const job of jobs) {
      const pdfPath = path.join(outDir, `${job.uuid}.pdf`);
      if (existsSync(pdfPath)) {
        existing.add(job.uuid);
      }
    }
    if (existing.size > 0) {
      filteredJobs = jobs.filter((j) => !existing.has(j.uuid));
      console.log(`[download] Skipping ${existing.size} already-downloaded PDF(s) (--resume)`);
    }
  }

  if (filteredJobs.length === 0) {
    console.log('[download] All PDFs already downloaded');
    return { total: jobs.length, skipped: jobs.length, success: 0, failed: 0 };
  }

  // Process via queue
  const queue = new DownloadQueue(
    async (job) => queueableDownload(job, { outDir }),
    concurrency,
  );

  queue.add(filteredJobs);
  const results = await queue.wait();

  const success = results.filter((r) => r.status === 'success').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  console.log(`[download] ${success} succeeded, ${failed} failed`);

  if (failed > 0) {
    for (const result of results) {
      if (result.status === 'failed') {
        console.warn(`  ✗ ${result.job.uuid}: ${result.error || 'Unknown error'}`);
      }
    }
  }

  return { total: jobs.length, skipped: jobs.length - filteredJobs.length, success, failed };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  const adapter = new OefaAdapter();
  const sections = resolveSections(adapter, opts.section);

  console.log('=== JSF/PrimeFaces Site Scraper ===');
  console.log(`Sections: ${sections.join(', ')}`);
  console.log(`Output:   ${path.resolve(opts.outDir)}`);
  if (opts.resume) console.log('Mode:     Resume (skip existing files)');
  console.log();

  let totalRecords = 0;
  let totalPdfSuccess = 0;
  let totalPdfFailed = 0;

  for (const sectionKey of sections) {
    // Phase 1: Scrape
    const records = await scrapeSection(adapter, sectionKey);
    if (records.length === 0) {
      console.warn(`[cli] No records scraped for "${sectionKey}". Skipping export and download.`);
      continue;
    }
    totalRecords += records.length;

    // Phase 2: Export
    await exportRecords(records, sectionKey, opts.outDir, opts.resume);

    // Phase 3: Download PDFs
    const pdfStats = await downloadPdfs(
      records, adapter, sectionKey, opts.outDir, opts.concurrency, opts.resume,
    );
    totalPdfSuccess += pdfStats.success;
    totalPdfFailed += pdfStats.failed;
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Records scraped:  ${totalRecords}`);
  console.log(`PDFs downloaded:  ${totalPdfSuccess}`);
  if (totalPdfFailed > 0) {
    console.log(`PDFs failed:      ${totalPdfFailed}`);
  }
  console.log('Done.');
}

main().catch((error) => {
  console.error(`[cli] Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
