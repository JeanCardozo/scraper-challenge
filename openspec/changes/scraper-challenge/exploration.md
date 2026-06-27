## Exploration: scraper-challenge — Site Investigation

### Current State
No scraper code exists yet. The project is an empty workspace with only SDD scaffolding (openspec config).

### Sites Investigated

#### Primary Site: jurisprudencia.pj.gob.pe
- **Status**: BLOCKED — returns HTTP 403 Forbidden on all requests
- **Proxy used**: Tested with stealth and basic proxy modes — both blocked
- **Detection**: WAF/Geo-blocking (Peruvian judiciary domain likely restricts non-Peruvian IPs)
- **Findings from map**: The `/jurisprudenciaweb/ServletDescarga` endpoint was discovered, suggesting a similar download-servlet pattern as OEFA
- **Recommendation for proposal**: Document this as a known blocker. If the scraper MUST target this site, it requires running from a Peruvian VPN/proxy or a hosted environment within Peru.

#### Alternate Site: publico.oefa.gob.pe (OEFA) — FULLY INVESTIGATED

**Technology Stack:**
- Java EE with JSF 2.x (Mojarra implementation, `<script src="/repdig/javax.faces.resource/jsf.js.xhtml?ln=javax.faces">`)
- PrimeFaces 6.0 (PrimeFaces widget library: `ui-datatable`, `ui-paginator`, `ui-button`, `ui-dialog`)
- nginx as reverse proxy/web server
- JSF ViewState required for all form submissions (large encoded Base64 string, changes per request)
- Server: nginx with no-cache headers

**Site Sections (4 total):**

| Section | URL | Schema Fields | Status |
|---------|-----|--------------|--------|
| Tribunal de Fiscalización Ambiental (TFA) | `consultaTfa.xhtml` | Nro, Expediente, Administrado, Unidad Fiscalizable, Sector, Nro Resolución Apelación, Archivo PDF | **Public** |
| Dirección de Fiscalización (DFSAI) | `consultaDfsai.xhtml` | Nro, Expediente, Administrado, Unidad Fiscalizable, Sector, Nro Resolución Sanción, Archivo PDF | **Public** |
| Instrumentos Gestión Ambiental (IGA) | `consultaIga.xhtml` | Nro, Administrado, Unidad Fiscalizable, Sector, Tipo Instrumento, Archivo PDF | **Public** |
| Repositorio de terceros (RP) | `consultaRp.xhtml` | Login required | **Authenticated** |

**TFA Section Deep Dive (confirmed working):**
- **Total records**: 1,753 records across **176 pages**
- **Page size**: 10 records per page
- **Columns**: Nro., Número de expediente, Administrado, Unidad fiscalizable, Sector, Nro. Resolución de Apelación, Archivo (PDF icon)
- **Sectors**: ELECTRICIDAD, HIDROCARBUROS, INDUSTRIA, MINERIA, PESQUERIA
- All metadata visible directly in the listing table — no detail page needed

**Search/Filter Form Fields:**
| Field | Input Type | ID |
|-------|-----------|-----|
| Número de expediente | Text input | `listarDetalleInfraccionRAAForm:txtNroexp` |
| Administrado | Text input | `listarDetalleInfraccionRAAForm:j_idt21` |
| Unidad fiscalizable | Text input | `listarDetalleInfraccionRAAForm:j_idt25` |
| Sector | Select (5 options) | `listarDetalleInfraccionRAAForm:idsector` |
| Nro. Resolución de Apelación | Text input | `listarDetalleInfraccionRAAForm:j_idt34` |

**Pagination Mechanism (confirmed via network analysis):**
- **Method**: POST with `javax.faces.partial.ajax=true` (JSF AJAX partial request)
- **Key parameters**:
  - `javax.faces.partial.ajax=true`
  - `javax.faces.source=listarDetalleInfraccionRAAForm:dt`
  - `listarDetalleInfraccionRAAForm:dt_pagination=true`
  - `listarDetalleInfraccionRAAForm:dt_first=0` → **offset** (10, 20, ... for page 2, 3, ...)
  - `listarDetalleInfraccionRAAForm:dt_rows=10` → **page size** (fixed at 10)
  - `javax.faces.ViewState=<base64-encoded-token>` → **required, changes per request**
  - Session cookie: `JSESSIONID=<hex>` → **required, established on first GET**
- **Response**: XML partial response with `<update id="...:dt">` containing HTML table rows

**PDF Download Mechanism (confirmed):**
- Each row has `<a href="#" onclick="mojarra.jsfcljs(...)">` with PDF icon
- On click, `mojarra.jsfcljs` (Mojarra JSF client library) submits the form as a **full POST** (not AJAX):
  - `listarDetalleInfraccionRAAForm:dt:0:j_idt63=<same>` → row download button
  - `param_uuid=<uuid>` → document UUID identifier
  - All form fields + ViewState included
- **Server response headers**:
  - `content-disposition: attachment; filename="RTFA N° 264-2012.pdf"` → **filename pattern: `RTFA N° {resolution-number}.pdf`**
  - `content-type: application/octet-stream`
- PDF naming convention: `RTFA N° {resolution-number}.pdf` where resolution number comes from the "Nro. Resolución de Apelación" column

**Excel Export (bonus — important for efficiency):**
- Icon link triggers full POST (not AJAX) with:
  - `listarDetalleInfraccionRAAForm:dt:j_idt38=<same>` → Excel button
- **Server response**:
  - `content-disposition: attachment; filename=RESOLUCIONES_APELACION.xls`
  - `content-type: application/vnd.ms-excel`
  - `set-cookie: primefaces.download=true`
- **Returns ALL 1,753 records in one XLS file** — much more efficient than 176 page requests

**Rate Limiting:**
- No 429 errors encountered during testing
- Server responded consistently with 200 on all requests
- nginx handles requests without visible throttling
- Safe to implement concurrent requests with moderate parallelism (e.g., 3-5 concurrent)

**Authentication:**
- TFA, DFSAI, and IGA sections: **No authentication required** — fully public
- RP section: Requires username/password login form

**JavaScript Rendering:**
- Initial page load is **fully server-rendered HTML** (no SPA JS rendering needed)
- Data retrieval uses PrimeFaces AJAX partial updates
- PDF downloads use `mojarra.jsfcljs()` which is pure JSF — but the mechanism can be replicated with direct POST requests
- **No headless browser needed** — Axios + Cheerio can handle this entirely

**Key Risks for Axios+Cheerio approach:**
1. **JSF ViewState**: Must extract ViewState from each response and include it in subsequent requests. It changes on every request.
2. **JSESSIONID cookie**: Must maintain session cookie across requests.
3. **PrimeFaces AJAX responses are XML** (not full HTML). Cheerio can parse the CDATA-wrapped HTML inside the XML response.
4. **PDF download requires form POST** with same parameters as the original form — not a direct URL.
5. **Excel export** is the most efficient way to get all metadata, but it returns XLS format (requires parsing library or converting).

### Approaches

1. **Excel Export + Individual PDF Downloads** — Use the Excel export to get ALL metadata in one XLS file, then download PDFs individually using the UUIDs extracted from the metadata
   - Pros: Only 1 request for metadata (vs 176), complete dataset, fastest metadata extraction
   - Cons: Requires XLS parsing dependency, PDF UUIDs are in the AJAX responses not in the XLS
   - Effort: Low

2. **Paginated AJAX Scrape + PDF Downloads** — Scrape all 176 pages via PrimeFaces AJAX POSTs, extracting metadata + param_uuid from each row, then download PDFs
   - Pros: Full control, param_uuid available per row, pure axios+cheerio
   - Cons: 176 sequential requests for metadata, more complex ViewState management
   - Effort: Medium

3. **Hybrid: Excel Export for Metadata + Pagination UUID Mapping** — Get metadata from Excel, then make a single AJAX request per page to extract param_uuids, then download PDFs
   - Pros: Best balance, Excel gives metadata, AJAX gives UUIDs
   - Cons: Two-phase mapping required
   - Effort: Medium

### Recommendation

**Approach 2 (Paginated AJAX)** for the initial implementation because:
- No additional parsing dependency (XLS) required
- param_uuid is available directly in each row's download link
- The pagination mechanism is well-understood and consistent
- Keeps the stack simple: axios + cheerio only
- The ViewState management pattern applies to all 3 public sections

If performance becomes an issue with 176 pages, a future optimization could add Excel export parsing.

### Risks
- **Primary site (jurisprudencia.pj.gob.pe) is 403 blocked** — may require Peruvian IP/VPN. Document as "site not accessible from current location"
- **JSF ViewState tokens change per request** — must extract from every response and submit with next request
- **PrimeFaces AJAX responses are XML** — must parse XML to extract CDATA-wrapped HTML table rows
- **Session management** — JSESSIONID cookie must be maintained; may expire
- **OEFA site stability** — server is nginx with no-cache headers but showed no rate limiting during testing
- **PDF naming** — filenames come from content-disposition header, need to handle special characters (spaces, N° symbol)
- **Excel export alternative** — if pagination performance is poor, Excel export is available as backup

### Ready for Proposal
**Yes** — the OEFA alternate site has been fully characterized. The primary site needs a note about its inaccessibility. The orchestrator should:
1. Proceed with SDD proposal for OEFA-based scraper
2. Document the primary site as "requires Peruvian IP — cannot validate from current location"
3. Design the scraper to be site-configurable (same JSF pattern can work for both)
