# scraper-challenge

A TypeScript scraper for **JSF 2.x / PrimeFaces 6.0** public consultation systems. Implements paginated AJAX scraping through the JSF partial-response lifecycle — no headless browser required.

Currently ships with an adapter for **OEFA** (Peru's Environmental Assessment and Enforcement Agency), supporting three public consultation sections.

## Prerequisites

- **Node.js 18+** (tested with Node 22)
- npm (ships with Node.js)

## Installation

```bash
npm install
```

## Usage

### CLI

```bash
npx tsx src/cli/index.ts <section> <out-dir> [options]
```

#### Sections

| Section | Key | Description |
|---------|-----|-------------|
| TFA | `tfa` | Tribunal de Fiscalización Ambiental |
| DFSAI | `dfsai` | Dirección de Fiscalización Sanción y Asuntos de Impacto |
| IGA | `iga` | Instrumentos de Gestión Ambiental |
| All | `all` | All three sections (each gets its own scrape run) |

#### Options

| Option | Description |
|--------|-------------|
| `--resume` | Skip existing JSONL/CSV/PDF files; retry only failed downloads |
| `--concurrency N` | PDF download pool size (1–10, default 3) |
| `--help` | Show help message |

#### Examples

Scrape TFA records to `./output`:
```bash
npx tsx src/cli/index.ts tfa ./output
```

Scrape all sections to `./data` with 5 concurrent PDF downloads:
```bash
npx tsx src/cli/index.ts all ./data --concurrency 5
```

Resume an interrupted run (skip already-downloaded files):
```bash
npx tsx src/cli/index.ts dfsai ./data --resume
```

### PDF Download Behavior

The scraper operates in two phases:

1. **Metadata scrape**: Paginated AJAX requests extract table records (resolución number, date, summary, etc.) from PrimeFaces DataTables. Records are saved as JSON Lines (`.jsonl`) and CSV (`.csv`) with UTF-8 BOM for Excel compatibility.

2. **PDF download**: Each record with a download link is queued. The downloader:
   - POSTs a JSF form request with the document UUID
   - Follows HTTP redirects to the actual PDF
   - Extracts the filename from the `Content-Disposition` header
   - Sanitizes special characters (`ñ` → `n`, `N°` → `No`, spaces → `_`, etc.)
   - Falls back to `{uuid}.pdf` if no header is present
   - Retries failed downloads with exponential backoff (up to 3×)
   - Does **not** retry on 4xx errors (except 429 rate-limit)

With `--resume`, the scraper skips existing JSONL/CSV files and PDFs, and only processes new or previously-failed items.

### Output Format

#### JSON Lines (`.jsonl`)

One JSON object per line. Compatible with streaming tools and most data processing pipelines.

```json
{"nro":"1","expediente":"EXP-001","administrado":"ACME SAC","_section":"tfa","_uuid":"abc-123"}
```

#### CSV (`.csv`)

UTF-8 with BOM for Excel compatibility. RFC 4180 quoting (commas and double-quotes are properly escaped).

### Configuration

Configuration lives in `openspec/changes/scraper-challenge/`. The OEFA adapter in `src/oefa/adapter.ts` defines URLs, form IDs, and column mappings for each section. To add a new site, implement the `SiteAdapter` interface (see `src/scraper/adapter.ts`).

## Project Structure

```
src/
├── cli/
│   └── index.ts          # CLI entry point
├── export/
│   ├── csv.ts            # CSV writer (UTF-8 BOM, RFC 4180)
│   └── json.ts           # JSON Lines writer
├── oefa/
│   ├── adapter.ts        # OEFA site adapter (3 sections)
│   └── types.ts          # OEFA typed record interfaces
├── pdf/
│   ├── downloader.ts     # PDF download with retry + backoff
│   └── queue.ts          # Semaphore-based download pool
├── scraper/
│   ├── adapter.ts        # SiteAdapter interface
│   ├── engine.ts         # Paginated JSF scraping engine
│   ├── session.ts        # HTTP session + ViewState management
│   └── xml-parser.ts     # JSF partial-response XML parser
├── types.ts              # Shared type definitions
└── __tests__/            # Unit and integration tests
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript |
| `npm run typecheck` | Type-check without emitting files |
| `npm test` | Run vitest tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm start` | Run `src/cli/index.ts` via tsx |

## Important Notes

- The primary target site is **jurisprudencia.pj.gob.pe** (Peruvian Judicial Branch), which requires a Peruvian IP address to access. The OEFA adapter targets **publico.oefa.gob.pe**.
- This tool interacts with live websites. Be respectful of server resources — the default concurrency of 3 keeps the load reasonable.
- The JSF ViewState lifecycle means each pagination request depends on the previous response's ViewState. If the session expires mid-run, the tool reports a `StaleSessionError`.
