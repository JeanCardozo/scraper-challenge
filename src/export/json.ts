/**
 * @file JSON Lines data export.
 *
 * Writes scraped records as JSON Lines (one valid JSON object per line,
 * terminated by \n). Supports append mode for resumable runs and
 * optional field filtering.
 */

import { createWriteStream } from 'node:fs';
import { once } from 'node:events';

import type { ScrapedRecord } from '../types.js';

/**
 * Options for the JSON Lines writer.
 */
export interface JsonLinesOptions {
  /** Optional subset of fields to include (default: all non-system fields) */
  fieldFilter?: string[];
  /** Append to existing file instead of overwriting (default: false) */
  append?: boolean;
}

/**
 * Determine the ordered list of field names for export.
 *
 * Derives fields from the first record, optionally filtered.
 * System fields (_section, _uuid) are included by default since
 * they carry important metadata.
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
 * Write records to a JSON Lines file.
 *
 * Each record is serialized as a single JSON object followed by \n.
 * The file is created empty (0 bytes) when the record array is empty.
 *
 * @param records  - Records to write
 * @param filePath - Output file path
 * @param options  - Formatting options
 */
export async function writeJsonLines(
  records: ScrapedRecord[],
  filePath: string,
  options: JsonLinesOptions = {},
): Promise<void> {
  const fields = resolveFields(records, options.fieldFilter);
  const flags = options.append ? 'a' : 'w';

  const stream = createWriteStream(filePath, { flags, encoding: 'utf-8' });

  try {
    for (const record of records) {
      const line: Record<string, string | null> = {};
      for (const field of fields) {
        line[field] = record[field] ?? null;
      }
      stream.write(JSON.stringify(line) + '\n');
    }
  } finally {
    stream.end();
    await once(stream, 'finish');
  }
}
