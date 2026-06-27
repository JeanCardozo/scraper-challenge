/**
 * Unit tests for PDF downloader helpers — isNonRetryable4xx and
 * extractFilenameFromHeader.
 *
 * These functions were exported from src/pdf/downloader.ts for
 * direct testability without network calls.
 */

import { describe, it, expect } from 'vitest';
import {
  isNonRetryable4xx,
  extractFilenameFromHeader,
} from '../pdf/downloader.js';

// ---------------------------------------------------------------------------
// isNonRetryable4xx
// ---------------------------------------------------------------------------

describe('isNonRetryable4xx', () => {
  it('returns true for 404', () => {
    const axiosError = {
      response: { status: 404 },
    };
    expect(isNonRetryable4xx(axiosError)).toBe(true);
  });

  it('returns true for 403', () => {
    const axiosError = {
      response: { status: 403 },
    };
    expect(isNonRetryable4xx(axiosError)).toBe(true);
  });

  it('returns true for 401', () => {
    const axiosError = {
      response: { status: 401 },
    };
    expect(isNonRetryable4xx(axiosError)).toBe(true);
  });

  it('returns false for 429 (rate-limited — should retry)', () => {
    const axiosError = {
      response: { status: 429 },
    };
    expect(isNonRetryable4xx(axiosError)).toBe(false);
  });

  it('returns false for 502 (not a 4xx status)', () => {
    const axiosError = {
      response: { status: 502 },
    };
    expect(isNonRetryable4xx(axiosError)).toBe(false);
  });

  it('returns false for 500', () => {
    const axiosError = {
      response: { status: 500 },
    };
    expect(isNonRetryable4xx(axiosError)).toBe(false);
  });

  it('returns false for non-axios errors (no response property)', () => {
    expect(isNonRetryable4xx(new Error('Network error'))).toBe(false);
  });

  it('returns false for null/undefined input', () => {
    expect(isNonRetryable4xx(null)).toBe(false);
    expect(isNonRetryable4xx(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractFilenameFromHeader
// ---------------------------------------------------------------------------

describe('extractFilenameFromHeader', () => {
  it('parses filename from "filename="RTFA N° 123.pdf""', () => {
    const header = 'attachment; filename="RTFA N° 123.pdf"';
    expect(extractFilenameFromHeader(header)).toBe('RTFA N° 123.pdf');
  });

  it('prefers filename*=UTF-8\'\'... over plain filename', () => {
    const header = 'attachment; filename="old-name.pdf"; filename*=UTF-8\'\'preferred-name.pdf';
    expect(extractFilenameFromHeader(header)).toBe('preferred-name.pdf');
  });

  it('decodes URI-encoded filename* values', () => {
    const header = "attachment; filename*=UTF-8''RTFA%20N%C2%B0%20123.pdf";
    expect(extractFilenameFromHeader(header)).toBe('RTFA N° 123.pdf');
  });

  it('returns null when header is missing', () => {
    expect(extractFilenameFromHeader(null)).toBeNull();
  });

  it('returns null when header is undefined', () => {
    expect(extractFilenameFromHeader(undefined)).toBeNull();
  });

  it('returns null when header is an empty string', () => {
    expect(extractFilenameFromHeader('')).toBeNull();
  });

  it('extracts bare filename without quotes', () => {
    const header = 'attachment; filename=report.pdf';
    expect(extractFilenameFromHeader(header)).toBe('report.pdf');
  });

  it('handles ISO-8859-1 encoding in filename*', () => {
    const header = "attachment; filename*=ISO-8859-1''informe.pdf";
    expect(extractFilenameFromHeader(header)).toBe('informe.pdf');
  });
});
