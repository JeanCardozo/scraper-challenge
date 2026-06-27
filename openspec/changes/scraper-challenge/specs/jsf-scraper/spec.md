# JSF Scraper Specification

## Purpose

Core engine for scraping JSF/PrimeFaces paginated data tables via AJAX partial requests. Handles session lifecycle, ViewState tracking, offset-based pagination, and XML-to-records parsing. Works with any JSF site via the Adapter interface.

## Requirements

### Requirement: Session Management

The system MUST establish a JSESSIONID via an initial GET request. The system MUST extract the `javax.faces.ViewState` value from every full-page response and every AJAX partial-response. The system MUST include the extracted ViewState in all subsequent POST requests. ViewState changes per response — the system MUST use the ViewState from response N-1 when sending request N.

#### Scenario: Complete session lifecycle

- GIVEN a valid adapter config with a target URL
- WHEN the session initializes via GET
- THEN a JSESSIONID cookie is stored
- AND the initial ViewState is extracted from the full-page HTML

#### Scenario: ViewState rotation between pages

- GIVEN an active session at pagination step 5
- WHEN the AJAX response for step 5 contains a new ViewState
- THEN request for step 6 MUST include that new ViewState value

### Requirement: Pagination

The system MUST support offset-based pagination via the `dt_first` parameter. The system MUST respect a configurable page size (`dt_rows`, default 10). The system MUST iterate pages until the server returns an empty record set or a configurable maximum page limit is reached. Each page SHALL be fetched via AJAX POST with `javax.faces.partial.ajax=true`.

#### Scenario: Happy path — full iteration

- GIVEN a section with 1,753 records and page size 10
- WHEN the paginator loops from offset 0
- THEN it issues 176 AJAX POSTs
- AND each response yields records until empty at page 177

#### Scenario: Empty section

- GIVEN a section with 0 records
- WHEN the first AJAX POST returns an empty rowset
- THEN the paginator SHALL return an empty record array immediately
- AND no further requests are made

### Requirement: XML Parsing

The system MUST parse JSF partial-response XML. The system MUST extract CDATA-wrapped HTML fragments from `<update id="...">` elements. The system MUST pass extracted HTML row elements to the adapter-supplied row parser.

#### Scenario: Record extraction from CDATA

- GIVEN a valid AJAX response with CDATA-wrapped `<tr>` rows
- WHEN the XML parser extracts the `<update>` content
- THEN each `<tr>` is passed to the adapter parser
- AND zero malformed records are produced

#### Scenario: Empty AJAX response

- GIVEN a pagination step where no rows exist
- WHEN the AJAX response contains `<update>` with empty CDATA
- THEN the parser returns zero records
- AND the paginator stops

### Requirement: Error Handling

The system MUST handle HTTP errors with configurable retry (default 3 attempts). The system MUST abort pagination if ViewState cannot be extracted after retries. Individual page failures SHALL NOT halt the full pagination run.

#### Scenario: Retry on transient failure

- GIVEN paginator at page 10
- WHEN the server returns HTTP 502
- THEN the engine retries up to configured attempts with backoff
- AND continues to page 11 on success

#### Scenario: Stale session abort

- GIVEN an expired JSESSIONID mid-run
- WHEN a request returns a login page or redirect
- THEN the engine MUST abort with a clear stale-session error
