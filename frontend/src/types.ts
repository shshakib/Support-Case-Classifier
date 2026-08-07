export interface TaxonomyItem { name: string; description: string; }

export interface CaseRecord {
  CaseNumber: string;
  CaseTitle: string;
  Description: string;
  StatusReason: string;
  [column: string]: string;
}

export interface CsvIssue { row: number; message: string; }

export interface ParsedCaseFile {
  fileName: string;
  cases: CaseRecord[];
  columns: string[];
  skippedRows: number;
  issues: CsvIssue[];
  fatalError?: string;
}

export interface CategorizedCase {
  originalCase: Record<string, unknown>;
  predictedCategory: string;
  predictedResolution: string;
  predictedCertainty: string;
  predictedReasoning: string;
  error?: string | null;
}

export interface ModelInfo {
  id: string;
  provider: string;
  displayName: string;
  modelName: string;
  configured: boolean;
  local: boolean;
  maxConcurrency: number;
}

export interface HealthResponse { status: "ok"; environment: string; }
export interface TelemetryModelSummary { batches: number; cases: number; errors: number; }
export interface TelemetrySummary {
  totalBatches: number;
  totalCases: number;
  successCount: number;
  errorCount: number;
  inputTokens: number;
  outputTokens: number;
  averageBatchDurationMs: number;
  models: Record<string, TelemetryModelSummary>;
}
