# OEFA Adapter Specification

## Purpose

Site-specific adapter for OEFA's public consultation system (JSF 2.x + PrimeFaces 6.0). Configures the jsf-scraper engine with URLs, form IDs, PrimeFaces widget vars, field-to-column mappings, and record types for three public sections: TFA, DFSAI, and IGA.

## Requirements

### Requirement: Section Configuration

The adapter MUST define URL, form ID (`javax.faces.source`), DataTable widget var, and pagination parameters (`dt_first`, `dt_rows`) for each of TFA, DFSAI, and IGA sections. The adapter MUST expose the list of available sections and their metadata for CLI display.

#### Scenario: TFA section config

- GIVEN a request for TFA section config
- WHEN the adapter returns section parameters
- THEN the config includes a valid URL, form ID, widget var, and page size of 10

#### Scenario: Unknown section

- GIVEN a section name not in TFA/DFSAI/IGA
- WHEN the adapter is queried for config
- THEN it MUST return null
- AND the caller SHALL report an invalid section error

### Requirement: Field Mapping

The adapter MUST map PrimeFaces DataTable columns to typed fields via CSS selector or column index. Fields include: N° Resolución, Fecha, Sumilla, Órgano, and others as defined in each section's table structure.

#### Scenario: Complete row parsing

- GIVEN a `<tr>` from a TFA page with all columns present
- WHEN the adapter maps columns to fields
- THEN each field is populated with the correct text content from the matching `<td>`

#### Scenario: Missing optional field

- GIVEN a row where the Fecha `<td>` is empty
- WHEN the adapter maps columns
- THEN the date field SHALL be set to null or empty string
- AND the row is still returned as a valid record

### Requirement: PDF Link Extraction

The adapter MUST extract PDF download parameters from each row's action links. The adapter MUST identify the `param_uuid` value and form action URL from the `mojarra.jsfcljs`-style JavaScript call in the link's `onclick` attribute.

#### Scenario: Valid PDF link

- GIVEN a row containing a `<button>` with an `onclick` calling `mojarra.jsfcljs`
- WHEN the adapter parses the onclick value
- THEN it extracts the `param_uuid` and the form action URL
- AND both values are attached to the output record

#### Scenario: Row without PDF link

- GIVEN a row where the action column is empty or missing the JSF click handler
- WHEN the adapter attempts to extract PDF params
- THEN it SHOULD return null for download params
- AND log a warning for audit
- AND the row is still included as a metadata-only record

### Requirement: Record Type

The adapter MUST define a typed interface per section with fields matching the scraped columns. All fields SHALL be optional strings to handle missing data gracefully.

#### Scenario: Record structure

- GIVEN a scraped TFA row
- WHEN the adapter produces a typed record
- THEN the record SHALL conform to the TFA record interface
- AND all string fields are nullable
