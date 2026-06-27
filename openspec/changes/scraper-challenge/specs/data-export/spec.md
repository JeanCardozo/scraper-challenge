# Data Export Specification

## Purpose

Writes scraped records to JSON Lines and CSV output files. Ensures encoding compatibility with Excel (UTF-8 BOM for CSV) and streaming-friendly output for large datasets.

## Requirements

### Requirement: JSON Lines Writer

The system MUST write one JSON object per line. The system MUST use UTF-8 encoding. The system MUST handle arrays of records by iterating and writing each record as a separate line. Each line SHALL be a valid JSON object terminated by a newline (`\n`).

#### Scenario: Records to JSON Lines

- GIVEN an array of 250 scraped records
- WHEN the JSON Lines writer processes them
- THEN the output file contains exactly 250 lines
- AND each line is parseable as a valid JSON object

#### Scenario: Empty record set

- GIVEN an empty array of records
- WHEN the JSON Lines writer processes them
- THEN the output file SHALL be created empty (zero bytes or zero lines)

### Requirement: CSV Writer

The system MUST write a header row with column names. The system MUST include a UTF-8 BOM (`\uFEFF`) as the first three bytes for Excel compatibility. The system MUST use comma as delimiter. Fields containing commas, double quotes, or newlines MUST be wrapped in double quotes. Double quotes within a field MUST be escaped by doubling.

#### Scenario: Full CSV output

- GIVEN records with string, numeric, and date fields
- WHEN the CSV writer produces the file
- THEN the first 3 bytes are UTF-8 BOM
- AND the first data row contains column headers
- AND subsequent rows contain the record data formatted as CSV

#### Scenario: Field with comma

- GIVEN a record field containing `"Smith, John & Sons"`
- WHEN the CSV writer writes the field
- THEN the field SHALL be quoted as `"Smith, John & Sons"`
- AND the CSV remains valid

#### Scenario: Empty record set

- GIVEN an empty array of records
- WHEN the CSV writer processes them
- THEN the output file SHALL contain BOM + header row only
- AND zero data rows

### Requirement: Field Filtering

The system SHOULD accept an optional field list to control which columns are written. If no field filter is provided, the system MUST write all fields present in the first record. The field order in the output SHALL match the order in the field list.

#### Scenario: Filtered columns

- GIVEN records with 8 fields and a field list of `["resolucion", "fecha"]`
- WHEN the writer processes them
- THEN the output CSV/JSON contains only the 2 specified fields
- AND they appear in the order specified

### Requirement: Append Mode

The system SHOULD support append mode for resumable runs. The system MUST create a new file by default. In append mode, the CSV writer MUST omit the header row since it already exists in the target file.

#### Scenario: Append to existing

- GIVEN an existing CSV file with header row
- WHEN the writer opens in append mode with 50 additional records
- THEN the file ends with 50 new data rows
- AND no duplicate header is written
