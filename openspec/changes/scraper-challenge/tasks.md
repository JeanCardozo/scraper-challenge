# Tasks: scraper-challenge — JSF/PrimeFaces Scraper

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,125 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Foundation+Engine) → PR 2 (Adapter+Export) → PR 3 (Downloader+CLI+Integration) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Base | Notes |
|------|------|-----------|------|-------|
| 1 | Foundation + JSF Engine Core | PR 1 | tracker | package.json, types, session, XML parser, engine, adapter interface. Includes unit tests for core. |
| 2 | OEFA Adapter + Data Export | PR 2 | PR 1 | OEFA types/adapter, JSON Lines + CSV writers with tests. |
| 3 | Downloader + CLI + Integration | PR 3 | PR 2 | Semaphore queue, downloader, CLI, integration test, README. |

## Phase 1: Foundation

- [x] 1.1 Create `package.json` (TypeScript 5.x, axios, cheerio, fast-xml-parser, vitest)
- [x] 1.2 Create `tsconfig.json` (strict, ESNext, NodeNext module resolution)
- [x] 1.3 Create `src/types.ts` (SiteAdapter, ScrapedRecord, DownloadJob, ExportOptions, SectionConfig)

## Phase 2: JSF Scraper Engine

- [x] 2.1 Create `src/scraper/adapter.ts` (SiteAdapter interface: name, sections, parseRow, extractDownloadParams)
- [x] 2.2 Create `src/scraper/session.ts` (GET-init, JSESSIONID + ViewState extraction, rotation per request)
- [x] 2.3 Create `src/scraper/xml-parser.ts` (fast-xml-parser → partial-response → CDATA → cheerio rows)
- [x] 2.4 Create `src/scraper/engine.ts` (offset pagination loop, retry ±50% jitter 100ms base, empty-set stop, stale session detect)

## Phase 3: OEFA Adapter

- [x] 3.1 Create `src/oefa/types.ts` (TfaRecord, DfsaiRecord, IgaRecord — nullable string fields)
- [x] 3.2 Create `src/oefa/adapter.ts` (3 section configs, widget vars, field mappings, mojarra.jsfcljs PDF param extraction)

## Phase 4: PDF Downloader

- [x] 4.1 Create `src/pdf/queue.ts` (semaphore pool 3 workers, pending/downloading/success/failed status)
- [x] 4.2 Create `src/pdf/downloader.ts` (form POST, content-disposition filename, sanitize, retry 3×, skip 4xx non-429)

## Phase 5: Data Export

- [x] 5.1 Create `src/export/json.ts` (one JSON object per line, UTF-8, append mode)
- [x] 5.2 Create `src/export/csv.ts` (UTF-8 BOM, RFC 4180 quoting, field filter, append w/o duplicate header)

## Phase 6: CLI

- [x] 6.1 Create `src/cli/index.ts` (npx tsx src/cli/index.ts `<section> <out-dir>` [--resume] [--concurrency N], phase orchestration)

## Phase 7: Tests

- [x] 7.1 Write ViewState extraction test (cheerio → hidden input value)
- [x] 7.2 Write ViewState from XML test (mock partial-response → CDATA content)
- [x] 7.3 Write CDATA row count test (known rows → assert ScrapedRecord length)
- [x] 7.4 Write filename sanitization test (`"N° 123/OEFA"` → `"No_123_OEFA"`)
- [x] 7.5 Write CSV quoting test (comma → quoted, double-quote → doubled)
- [x] 7.6 Write backoff jitter test (±50% range from 100ms base, ≥1ms)
- [x] 7.7 Write mock PrimeFaces HTTP server integration test (pagination offsets → JSF XML → records)

## Phase 8: Documentation

- [x] 8.1 Create `.gitignore` (node_modules, dist, \*.jsonl, \*.csv, \*.pdf)
- [x] 8.2 Create `README.md` (install, usage, section list, --resume, examples, configuration)
