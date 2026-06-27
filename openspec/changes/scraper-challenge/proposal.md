# Proposal: scraper-challenge — JSF/PrimeFaces Site Scraper

## Intent

Build a configurable scraper for JSF/PrimeFaces sites (OEFA primary target, jurisprudencia as future target) that extracts public tribunal resolution metadata and downloads associated PDFs. Output as JSON + CSV.

## Scope

### In Scope
- Paginated AJAX scraper engine for PrimeFaces DataTables (axios + cheerio)
- OEFA site adapter (TFA, DFSAI, IGA sections — all public)
- Two-phase PDF downloader with retry/backoff/jitter
- JSON + CSV output writers
- CLI entry point for single-site run
- GitHub repo with README showing usage

### Out of Scope
- XLS/Excel export parsing (documented optimization path)
- jurisprudencia.pj.gob.pe adapter (blocked from current location)
- Authenticated (RP) section scraping
- GUI / dashboard
- Scheduling or cron automation

## Capabilities

### New Capabilities
- `jsf-scraper`: core engine for JSF/PrimeFaces paginated AJAX — ViewState extraction, session mgmt, partial-XML parsing, site-configurable via adapter pattern
- `oefa-adapter`: OEFA-specific field mappings, URL paths, form IDs for TFA/DFSAI/IGA sections
- `pdf-downloader`: form-POST PDF download with configurable retry (3 attemps), exponential backoff (100ms base), jitter, parallel queue (3-5 workers)
- `data-export`: JSON line writer + CSV writer with UTF-8 BOM for Excel compat

### Modified Capabilities
- None (greenfield project)

## Approach

1. **Initialize** TypeScript project (tsconfig strict, eslint, vitest)
2. **Build `jsf-scraper`** — Adapter interface (site config), HttpSession class (JSESSIONID + ViewState lifecycle), Paginator (offset-based with concurrency control), XML-to-records parser (cheerio over CDATA)
3. **Build `oefa-adapter`** — Site config for TFA/DFSAI/IGA: URLs, form IDs, field mapping, PDF download link extraction
4. **Build `pdf-downloader`** — Worker pool with retry/backoff, filename from content-disposition header
5. **Build `data-export`** — JSON lines + CSV with headers
6. **CLI** — Simple positional args (section, output dir)

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/scraper/engine.ts` | New | Core JSF pagination loop |
| `src/scraper/session.ts` | New | ViewState + cookie management |
| `src/scraper/adapter.ts` | New | Adapter interface |
| `src/scraper/xml-parser.ts` | New | CDATA-wrapped HTML parser |
| `src/oefa/adapter.ts` | New | OEFA site configuration |
| `src/oefa/types.ts` | New | OEFA record types |
| `src/pdf/downloader.ts` | New | PDF download with retry |
| `src/pdf/queue.ts` | New | Concurrent download queue |
| `src/export/json.ts` | New | JSON output |
| `src/export/csv.ts` | New | CSV output |
| `src/cli/index.ts` | New | CLI entry point |
| `package.json` | New | Project manifest |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| ViewState pattern breaks on other JSF versions | Low | Adapter pattern isolates site specifics |
| OEFA adds CAPTCHA or rate limiting | Low | Configurable delays, documented fallback to Excel export |
| PDF download fails mid-batch | Med | Download queue tracks failures; retry command re-runs failed UUIDs |
| Special chars in PDF filenames (N°, ñ) | Med | Sanitize filenames, log original for audit |

## Rollback Plan

- **Metadata phase**: delete output JSON/CSV files, rerun from page 0
- **PDF phase**: delete partial PDF output, rerun with `--resume` using failed-UUID list
- **Full revert**: `git clean -fd` and `git checkout -- .` before merge

## Dependencies

- TypeScript 5.x, Node 18+
- axios, cheerio (runtime)
- vitest (dev, testing)
- No headless browser dependencies

## Success Criteria

- [ ] Scrapes all 1,753 TFA records (176 pages) end-to-end
- [ ] Downloads all associated PDFs with correct filenames
- [ ] Outputs valid JSON Lines + CSV
- [ ] DFSAI and IGA sections also produce complete output
- [ ] Zero unhandled exceptions on clean run
- [ ] README documents setup, usage, and configuration
