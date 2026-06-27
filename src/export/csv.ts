/**
 * @file CSV data export with UTF-8 BOM and RFC 4180 quoting.
 *
 * Writes scraped records to CSV files with Excel-compatible encoding
 * (UTF-8 BOM). Supports append mode (skips header row on append) and
 * optional field filtering.
 *
 * Quoting rules (RFC 4180):
 * - Fields containing commas, double quotes, or line breaks are quoted
 * - Double quotes inside quoted fields are escaped by doubling ("")
 * - The delimiter is comma
 */

import { createWriteStream } from 'node:fs';
import { once } from 'node:events';

import type { ScrapedRecord } from '../types.js';

/**
 * UTF-8 BOM character — prepended as the first 3 bytes for Excel
 * compatibility. Ensures Excel correctly interprets UTF-8 encoding
 * when opening the CSV file directly.
 */
const UTF8_BOM = '\uFEFF';

/**
 * Options for the CSV writer.
 */
export interface CsvOptions {
  /** Optional subset of fields to include (default: all fields) */
  fieldFilter?: string[];
  /** Append to existing file instead of overwriting (default: false) */
  append?: boolean;
}

/**
 * Escape and optionally quote a single CSV field value per RFC 4180.
 *
 * A field is quoted if it contains a comma, double quote, or line break.
 * Double quotes within the field are escaped by doubling.
 *
 * @param value - Raw field value (null becomes empty string)
 * @returns RFC 4180-compliant field representation
 */
function escapeCsvField(value: string | null): string {
  if (value === null || value === undefined) return '';

  const str = String(value);

  // Check if quoting is required
  if (
    str.includes(',') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Determine the ordered list of field names for export.
 *
 * @param records - Record array (uses first for field discovery)
 * @param filter  - Optional field whitelist
 * @returns Ordered field name array
 */
function resolveFields(
  records: ScrapedRecord[],
  filter?: string[],
): string[] {
  if (filter && filter.length > 0) return filter;
  if (records.length === 0) return [];
  return Object.keys(records[0]!);
}

/**
 * Write a single CSV row from record data.
 *
 * @param record - The record to serialize
 * @param fields - Ordered field names
 * @returns CSV row string (no trailing newline)
 */
function formatCsvRow(
  record: ScrapedRecord,
  fields: string[],
): string {
  return fields
    .map((field) => escapeCsvField(record[field] ?? null))
    .join(',');
}

/**
 * Write records to a CSV file with UTF-8 BOM and RFC 4180 quoting.
 *
 * Produces Excel-compatible output:
 * - First 3 bytes: UTF-8 BOM (\uFEFF)
 * - First row: column headers
 * - Subsequent rows: record data
 * - Empty record set: BOM + header only, zero data rows
 *
 * @param records  - Records to write
 * @param filePath - Output file path
 * @param options  - Formatting options
 */
export async function writeCsv(
  records: ScrapedRecord[],
  filePath: string,
  options: CsvOptions = {},
): Promise<void> {
  const fields = resolveFields(records, options.fieldFilter);
  const flags = options.append ? 'a' : 'w';

  const stream = createWriteStream(filePath, { flags, encoding: 'utf-8' });

  try {
    if (!options.append) {
      // Write UTF-8 BOM + header row for new files
      stream.write(UTF8_BOM);
      stream.write(fields.join(',') + '\n');
    }

    // Write data rows
    for (const record of records) {
      stream.write(formatCsvRow(record, fields) + '\n');
    }
  } finally {
    stream.end();
    await once(stream, 'finish');
  }
}
