# Design: scraper-challenge — JSF/PrimeFaces Site Scraper

## Technical Approach

Two-phase CLI tool. **Phase 1**: paginated AJAX scrape of PrimeFaces DataTables → parse JSF partial-response XML → extract CDATA-wrapped HTML → cheerio row parsing via adapter → write JSON Lines + CSV. **Phase 2**: read records → queue UUID-based PDF downloads → worker pool → form POST → content-disposition filename extraction → sanitize → write to disk.

No headless browser. Pure axios + cheerio over raw HTTP. Site-agnostic engine via Adapter pattern; OEFA is the first concrete adapter.

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scraper vs site isolation | **Adapter pattern** | Engine has zero OEFA imports. `SiteAdapter` isolates URLs, form IDs, row parsers. New site = new adapter, not engine fork. |
| HTTP client | **axios** | Cookie interceptors, configurable timeouts, battle-tested for form POST flows |
| HTML parsing | **cheerio** | Fast, jQuery-like API, works on CDATA fragments. No DOM overhead. |
| XML parsing | **fast-xml-parser** | Namespaced JSF partial-response XML. Handles CDATA extraction reliably. |
| Concurrency | **Semaphore worker pool** | Lightweight (3–5 workers). Queue tracks pending/failed/success per file. |
| PDF filenames | **content-disposition header** | Human-readable names (`RTFA N° 264-2012.pdf` → `RTFA_No_264-2012.pdf`). Fallback `{uuid}.pdf`. |
| Session lifecycle | **GET-init → abort on stale** | GET establishes JSESSIONID + ViewState. Login page mid-run = abort with clear error. |

## ViewState Lifecycle

Engine GETs target URL → server returns HTML + JSESSIONID + ViewState_A. Each subsequent POST includes the **previous** ViewState; each XML response carries the **next** ViewState in `<update id="javax.faces.ViewState">`.

```
GET /consultaTfa.xhtml ──► (HTML + VS_A)
POST dt_first=0, ViewState=VS_A ──► (XML + VS_B)
POST dt_first=10, ViewState=VS_B ──► (XML + VS_C)
```

## Data Flow

```
Phase 1: CLI ──► Engine ──► Session (GET → JSESSIONID + VS)
                └──► Loop dt_first=0,10,20...
                       └──► XML Parser → CDATA → cheerio rows
                              └──► Adapter.parseRow() → ScrapedRecord[]
                └──► Export → {section}.jsonl + {section}.csv

Phase 2: Read records → extract param_uuids → Worker pool (3 concurrent)
                ├──► Form POST → 200 → content-disposition → sanitize → write PDF
                └──► 4xx/5xx → backoff(100ms base, ±50% jitter) → retry ×3 → log fail
                └──► --resume: skip existing, retry only failed UUIDs
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/scraper/engine.ts` | Create | Pagination loop, error handling, adapter dispatch |
| `src/scraper/session.ts` | Create | GET-init, ViewState extraction & rotation |
| `src/scraper/adapter.ts` | Create | `SiteAdapter` interface |
| `src/scraper/xml-parser.ts` | Create | JSF partial-response → CDATA → cheerio |
| `src/oefa/adapter.ts` | Create | TFA/DFSAI/IGA configs, field mappings |
| `src/oefa/types.ts` | Create | TfaRecord, DfsaiRecord, IgaRecord interfaces |
| `src/pdf/downloader.ts` | Create | Form POST, content-disposition, retry/backoff |
| `src/pdf/queue.ts` | Create | Semaphore pool with status tracking |
| `src/export/json.ts` | Create | JSON Lines writer (append-capable) |
| `src/export/csv.ts` | Create | UTF-8 BOM, quoting, field filter, append mode |
| `src/cli/index.ts` | Create | Entry: `npx tsx src/cli/index.ts <section> <out-dir> [--resume] [--concurrency N]` |
| `src/types.ts` | Create | Shared type definitions |
| `package.json` | Create | TypeScript project manifest |
| `tsconfig.json` | Create | Strict TS config |

## Interfaces

```typescript
interface SiteAdapter {
  name: string; baseUrl: string; formId: string; widgetVar: string;
  sections: SectionConfig[];
  parseRow($tr: cheerio.Cheerio): ScrapedRecord | null;
  extractDownloadParams(record: ScrapedRecord): DownloadJob | null;
}
interface SectionConfig { key: string; label: string; path: string; pageSize: number; }
interface ScrapedRecord { [field: string]: string | null; _section: string; _uuid: string | null; }
interface DownloadJob { uuid: string; url: string; formParams: Record<string, string>; retryCount: number; }
interface ExportOptions { format: "jsonl" | "csv"; fieldFilter?: string[]; append?: boolean; }
```

## Testing Strategy

| Layer | What | How |
|-------|------|-----|
| Unit | ViewState extraction | cheerio load HTML → assert hidden input value |
| Unit | ViewState from XML | parse mock partial-response, assert CDATA content |
| Unit | CDATA row count | known rows in → assert ScrapedRecord[] length |
| Unit | Filename sanitization | `"N° 123/OEFA"` → `"No_123_OEFA"` |
| Unit | CSV quoting | comma → quoted; double-quote → escaped |
| Unit | Backoff jitter | assert ±50% range from base, ≥1ms |
| Integration | Mock PrimeFaces | HTTP server returning JSF XML for pagination offsets |
| E2E | — | Requires live OEFA access — skipped |

## Open Questions

None resolved in proposal + specs + exploration.
