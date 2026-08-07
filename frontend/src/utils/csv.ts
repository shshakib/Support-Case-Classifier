import Papa from "papaparse";

import type { CaseRecord, CategorizedCase, CsvIssue, ParsedCaseFile } from "../types";

type RequiredColumn = "CaseNumber" | "CaseTitle" | "Description" | "StatusReason";
type RawRow = Record<string, string | undefined>;
const REQUIRED_COLUMNS: RequiredColumn[] = ["CaseNumber", "CaseTitle", "Description", "StatusReason"];

function normalizeHeader(header: string): string {
  return header.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function parseCasesCsvText(text: string, fileName = "cases.csv"): ParsedCaseFile {
  const parsed = Papa.parse<RawRow>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
  });
  const sourceColumns = parsed.meta.fields ?? [];
  const normalizedSource = new Map(sourceColumns.map((column) => [normalizeHeader(column), column]));
  const columnMap = new Map<RequiredColumn, string>();
  for (const required of REQUIRED_COLUMNS) {
    const source = normalizedSource.get(normalizeHeader(required));
    if (source) columnMap.set(required, source);
  }
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !columnMap.has(column));
  if (missingColumns.length) {
    return { fileName, cases: [], columns: sourceColumns, skippedRows: parsed.data.length, issues: [], fatalError: `Missing required columns: ${missingColumns.join(", ")}.` };
  }

  const mappedSourceColumns = new Set(columnMap.values());
  const extraColumns = sourceColumns.filter((column) => !mappedSourceColumns.has(column));
  const columns = [...REQUIRED_COLUMNS, ...extraColumns];
  const cases: CaseRecord[] = [];
  const issues: CsvIssue[] = parsed.errors.map((error) => ({ row: (error.row ?? 0) + 2, message: error.message }));

  parsed.data.forEach((row, index) => {
    const values = Object.fromEntries(
      REQUIRED_COLUMNS.map((required) => [required, (row[columnMap.get(required)!] ?? "").trim()]),
    ) as Record<RequiredColumn, string>;
    const missingValues = REQUIRED_COLUMNS.filter((column) => !values[column]);
    if (missingValues.length) {
      issues.push({ row: index + 2, message: `Missing ${missingValues.join(", ")}.` });
      return;
    }
    const record: CaseRecord = { ...values };
    for (const column of extraColumns) record[column] = row[column] ?? "";
    cases.push(record);
  });

  return {
    fileName,
    cases,
    columns,
    skippedRows: parsed.data.length - cases.length,
    issues,
    fatalError: cases.length ? undefined : "No valid cases were found in this file.",
  };
}

export async function parseCasesCsvFile(file: File): Promise<ParsedCaseFile> {
  if (!file.name.toLowerCase().endsWith(".csv")) throw new Error("Choose a CSV file.");
  if (file.size > 10 * 1024 * 1024) throw new Error("The CSV must be smaller than 10 MB.");
  return parseCasesCsvText(await file.text(), file.name);
}

export function buildResultsCsv(results: CategorizedCase[]): string {
  return Papa.unparse(results.map((result) => ({
    ...result.originalCase,
    "Predicted Category": result.predictedCategory,
    "Predicted Resolution": result.predictedResolution,
    "Prediction Confidence": result.predictedCertainty,
    "Prediction Reasoning": result.predictedReasoning,
    "Processing Error": result.error ?? "",
  })));
}

export function downloadCsv(csv: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
