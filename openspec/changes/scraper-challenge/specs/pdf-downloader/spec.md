# PDF Downloader Specification

## Purpose

Downloads PDF documents via JSF form POST using download parameters extracted during metadata scraping. Implements configurable retry with exponential backoff, jitter, and concurrent worker pool for batch efficiency.

## Requirements

### Requirement: Download Request

The system MUST perform a form POST using `mojarra.jsfcljs`-style arguments (`javax.faces.source`, `javax.faces.partial=false`, `param_uuid`). The system MUST follow HTTP redirects. The system MUST handle binary PDF response and write to disk.

#### Scenario: Successful PDF download

- GIVEN a valid UUID and form action URL
- WHEN the downloader POSTs with correct JSF arguments
- THEN a PDF file is saved to disk
- AND the response status is 200 with `application/pdf` content type

### Requirement: Filename Extraction

The system MUST extract the filename from the `content-disposition` header. The system MUST sanitize special characters (N°, ñ, spaces, slashes) to safe filesystem characters. If the header is missing, the system MUST fall back to a UUID-based filename.

#### Scenario: Filename from header

- GIVEN a response with `content-disposition: attachment; filename="RTFA N° 123-2024/OEFA.pdf"`
- WHEN the downloader extracts the filename
- THEN the saved filename SHALL be sanitized to `RTFA_No_123-2024_OEFA.pdf`
- AND the original filename is logged for audit

#### Scenario: Missing content-disposition

- GIVEN a response without a `content-disposition` header
- WHEN the downloader extracts the filename
- THEN it MUST fall back to `{uuid}.pdf`
- AND log a warning

### Requirement: Retry with Backoff

The system MUST retry failed downloads up to a configurable maximum (default 3). The system MUST wait between retries using exponential backoff with a configurable base delay (default 100ms) plus random jitter (±50% of the base). The system SHALL NOT retry on HTTP 4xx errors other than 429 (rate-limited).

#### Scenario: Transient failure recovery

- GIVEN a download that fails with HTTP 502
- WHEN the retry logic executes
- THEN the delay before retry 1 is ~100ms + jitter
- AND the delay before retry 2 is ~200ms + jitter
- AND retry 3 completes successfully

#### Scenario: Permanent 404

- GIVEN a UUID that returns HTTP 404
- WHEN the downloader receives the response
- THEN it SHALL NOT retry
- AND the failure is logged immediately

### Requirement: Worker Pool

The system MUST support a configurable concurrent download pool (default 3, range 1–10). The system MUST queue remaining downloads and dispatch them as workers become free. The system MUST track per-file status (pending, downloading, success, failed).

#### Scenario: Concurrent queue

- GIVEN 50 queued downloads with pool size 3
- WHEN the downloader starts
- THEN exactly 3 downloads are in-flight at any time
- AND all 50 eventually complete

#### Scenario: Individual failure isolation

- GIVEN 10 queued downloads where UUID 5 is invalid
- WHEN downloader processes the queue
- THEN UUID 5 is logged as failed
- AND the other 9 download successfully
- AND the process does not crash
