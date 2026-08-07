import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Download,
  Eye,
  FileSpreadsheet,
  Filter,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { categorizeCases } from "../api/client";
import { buildResultsCsv, downloadCsv, parseCasesCsvFile } from "../utils/csv";
import type {
  CategorizedCase,
  ModelInfo,
  ParsedCaseFile,
  TaxonomyItem,
} from "../types";


interface ClassifierPageProps {
  categories: TaxonomyItem[];
  resolutions: TaxonomyItem[];
  models: ModelInfo[];
  selectedModel: ModelInfo | null;
  onSelectModel: (modelId: string) => void;
}


const PREVIEW_ROW_LIMIT = 8;


function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}


export default function ClassifierPage({
  categories,
  resolutions,
  models,
  selectedModel,
  onSelectModel,
}: ClassifierPageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsedFile, setParsedFile] = useState<ParsedCaseFile | null>(null);
  const [results, setResults] = useState<CategorizedCase[]>([]);
  const [selectedResult, setSelectedResult] = useState<CategorizedCase | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [certaintyFilter, setCertaintyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadFile = async (file: File) => {
    setError(null);
    setResults([]);
    setSelectedResult(null);
    try {
      const parsed = await parseCasesCsvFile(file);
      setParsedFile(parsed);
      if (parsed.fatalError) setError(parsed.fatalError);
    } catch (uploadError) {
      setParsedFile(null);
      setError(uploadError instanceof Error ? uploadError.message : "The CSV could not be read.");
    }
  };

  const resetWorkspace = () => {
    setParsedFile(null);
    setResults([]);
    setSelectedResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const classify = async () => {
    if (!parsedFile?.cases.length || !selectedModel) return;
    setIsClassifying(true);
    setError(null);
    try {
      setResults(await categorizeCases(selectedModel.id, parsedFile.cases));
    } catch (classificationError) {
      setError(
        classificationError instanceof Error
          ? classificationError.message
          : "Classification failed.",
      );
    } finally {
      setIsClassifying(false);
    }
  };

  const successCount = results.filter((result) => !result.error).length;
  const errorCount = results.length - successCount;
  const lowConfidenceCount = results.filter(
    (result) => result.predictedCertainty === "low" && !result.error,
  ).length;

  const filteredResults = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return results.filter((result) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          result.originalCase.CaseNumber,
          result.originalCase.CaseTitle,
          result.predictedCategory,
          result.predictedResolution,
        ].some((value) => displayValue(value).toLowerCase().includes(normalizedSearch));
      const matchesCertainty =
        certaintyFilter === "all" || result.predictedCertainty === certaintyFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "error" ? Boolean(result.error) : !result.error);
      return matchesSearch && matchesCertainty && matchesStatus;
    });
  }, [certaintyFilter, results, search, statusFilter]);

  const activeStep = results.length ? 3 : parsedFile?.cases.length ? 2 : 1;
  const canClassify = Boolean(
    parsedFile?.cases.length &&
      selectedModel?.configured &&
      categories.length &&
      resolutions.length &&
      !isClassifying,
  );

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Classification workspace</p>
          <h1>Support cases</h1>
        </div>
        {parsedFile && (
          <button className="button button-secondary" onClick={resetWorkspace}>
            <RotateCcw size={16} />
            Start over
          </button>
        )}
      </div>

      <ol className="workflow-steps" aria-label="Classification progress">
        {["Upload", "Review", "Results"].map((label, index) => {
          const step = index + 1;
          return (
            <li key={label} className={step <= activeStep ? "active" : ""}>
              <span>{step < activeStep ? <CheckCircle2 size={16} /> : step}</span>
              {label}
              {index < 2 && <ChevronRight size={16} aria-hidden="true" />}
            </li>
          );
        })}
      </ol>

      {error && (
        <div className="notice notice-error" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button className="icon-button" onClick={() => setError(null)} title="Dismiss error">
            <X size={16} />
          </button>
        </div>
      )}

      {!parsedFile && (
        <section className="workspace-section upload-section">
          <div
            className={`dropzone ${isDragging ? "dragging" : ""}`}
            onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              const file = event.dataTransfer.files[0];
              if (file) void loadFile(file);
            }}
          >
            <div className="dropzone-icon"><Upload size={24} /></div>
            <h2>Upload cases CSV</h2>
            <p>CaseNumber, CaseTitle, Description, and StatusReason are required.</p>
            <label className="button button-primary" htmlFor="csv-upload">
              <FileSpreadsheet size={17} />
              Choose CSV
            </label>
            <input
              ref={inputRef}
              id="csv-upload"
              className="visually-hidden"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void loadFile(file);
              }}
            />
          </div>
        </section>
      )}

      {parsedFile && (
        <section className="workspace-section">
          <div className="section-heading file-heading">
            <div className="file-identity">
              <FileSpreadsheet size={20} />
              <div>
                <h2>{parsedFile.fileName}</h2>
                <p>{parsedFile.cases.length} valid cases · {parsedFile.columns.length} columns</p>
              </div>
            </div>
            {parsedFile.skippedRows > 0 && (
              <span className="badge badge-warning">{parsedFile.skippedRows} skipped</span>
            )}
          </div>

          {parsedFile.issues.length > 0 && (
            <div className="row-issues">
              {parsedFile.issues.slice(0, 4).map((issue) => (
                <p key={`${issue.row}-${issue.message}`}>Row {issue.row}: {issue.message}</p>
              ))}
              {parsedFile.issues.length > 4 && <p>And {parsedFile.issues.length - 4} more issues.</p>}
            </div>
          )}

          {parsedFile.cases.length > 0 && (
            <div className="table-scroll preview-table">
              <table>
                <thead><tr>{parsedFile.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                <tbody>
                  {parsedFile.cases.slice(0, PREVIEW_ROW_LIMIT).map((caseRecord, index) => (
                    <tr key={`${caseRecord.CaseNumber}-${index}`}>
                      {parsedFile.columns.map((column) => (
                        <td key={column} title={displayValue(caseRecord[column])}>{displayValue(caseRecord[column])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedFile.cases.length > PREVIEW_ROW_LIMIT && (
                <div className="table-more">{parsedFile.cases.length - PREVIEW_ROW_LIMIT} more rows</div>
              )}
            </div>
          )}

          <div className="action-bar">
            <label className="field compact-field">
              <span>Model</span>
              <select value={selectedModel?.id ?? ""} onChange={(event) => onSelectModel(event.target.value)}>
                {models.map((model) => (
                  <option key={model.id} value={model.id} disabled={!model.configured}>
                    {model.displayName} · {model.modelName}{model.configured ? "" : " (not configured)"}
                  </option>
                ))}
              </select>
            </label>
            <div className="taxonomy-counts">
              <span>{categories.length} categories</span>
              <span>{resolutions.length} resolutions</span>
            </div>
            <button className="button button-primary classify-button" disabled={!canClassify} onClick={() => void classify()}>
              {isClassifying ? <span className="spinner" aria-hidden="true" /> : <CheckCircle2 size={17} />}
              {isClassifying ? `Classifying ${parsedFile.cases.length} cases` : "Classify cases"}
            </button>
          </div>

          {selectedModel && !selectedModel.configured && (
            <p className="field-message field-message-error">
              Configure {selectedModel.displayName} in the backend environment or select another model.
            </p>
          )}
        </section>
      )}

      {results.length > 0 && (
        <section className="workspace-section results-section">
          <div className="section-heading results-heading">
            <div>
              <h2>Classification results</h2>
              <p>{results.length} cases processed with {selectedModel?.displayName}</p>
            </div>
            <button className="button button-secondary" onClick={() => downloadCsv(buildResultsCsv(results), "classified-support-cases.csv")}>
              <Download size={16} />
              Export CSV
            </button>
          </div>

          <div className="summary-strip" aria-label="Result summary">
            <div><strong>{successCount}</strong><span>Successful</span></div>
            <div><strong>{lowConfidenceCount}</strong><span>Low confidence</span></div>
            <div><strong>{errorCount}</strong><span>Errors</span></div>
          </div>

          <div className="result-toolbar">
            <label className="search-field">
              <Filter size={16} aria-hidden="true" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search results" aria-label="Search results" />
            </label>
            <select value={certaintyFilter} onChange={(event) => setCertaintyFilter(event.target.value)} aria-label="Filter by confidence">
              <option value="all">All confidence</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="unknown">Unknown</option>
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
              <option value="all">All statuses</option><option value="success">Successful</option><option value="error">Errors</option>
            </select>
          </div>

          <div className="table-scroll results-table">
            <table>
              <thead><tr><th>Case</th><th>Category</th><th>Resolution</th><th>Confidence</th><th>Status</th><th><span className="visually-hidden">Details</span></th></tr></thead>
              <tbody>
                {filteredResults.map((result, index) => (
                  <tr key={`${displayValue(result.originalCase.CaseNumber)}-${index}`}>
                    <td className="case-cell"><strong>{displayValue(result.originalCase.CaseNumber)}</strong><span>{displayValue(result.originalCase.CaseTitle)}</span></td>
                    <td>{result.predictedCategory}</td>
                    <td>{result.predictedResolution}</td>
                    <td><span className={`badge confidence-${result.predictedCertainty}`}>{result.predictedCertainty}</span></td>
                    <td><span className={`status-label ${result.error ? "failed" : "succeeded"}`}>{result.error ? "Error" : "Complete"}</span></td>
                    <td><button className="icon-button" onClick={() => setSelectedResult(result)} title="View case details"><Eye size={17} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredResults.length === 0 && <div className="empty-table">No results match these filters.</div>}
          </div>
        </section>
      )}

      {selectedResult && (
        <div className="drawer-backdrop" role="presentation" onMouseDown={() => setSelectedResult(null)}>
          <aside className="details-drawer" role="dialog" aria-modal="true" aria-labelledby="details-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div><p className="eyebrow">{displayValue(selectedResult.originalCase.CaseNumber)}</p><h2 id="details-title">{displayValue(selectedResult.originalCase.CaseTitle)}</h2></div>
              <button className="icon-button" onClick={() => setSelectedResult(null)} title="Close details"><X size={18} /></button>
            </div>
            <dl className="detail-list">
              <div><dt>Description</dt><dd>{displayValue(selectedResult.originalCase.Description)}</dd></div>
              <div><dt>Status reason</dt><dd>{displayValue(selectedResult.originalCase.StatusReason)}</dd></div>
              <div><dt>Category</dt><dd>{selectedResult.predictedCategory}</dd></div>
              <div><dt>Resolution</dt><dd>{selectedResult.predictedResolution}</dd></div>
              <div><dt>Confidence</dt><dd>{selectedResult.predictedCertainty}</dd></div>
              <div><dt>Reasoning</dt><dd>{selectedResult.predictedReasoning}</dd></div>
              {selectedResult.error && <div><dt>Error</dt><dd className="error-text">{selectedResult.error}</dd></div>}
            </dl>
          </aside>
        </div>
      )}
    </div>
  );
}
