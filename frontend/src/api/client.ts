import type { CaseRecord, CategorizedCase, HealthResponse, ModelInfo, TaxonomyItem, TelemetrySummary } from "../types";


const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api";

interface ApiErrorBody { detail?: string | Array<{ loc?: Array<string | number>; msg?: string }>; }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    let body: ApiErrorBody | null = null;
    try { body = (await response.json()) as ApiErrorBody; } catch { /* Use status fallback. */ }
    const detail = body?.detail;
    if (typeof detail === "string") throw new Error(detail);
    if (Array.isArray(detail)) throw new Error(detail.map((item) => item.msg ?? "Invalid request").join("; "));
    throw new Error(`${response.status} ${response.statusText}`.trim());
  }
  return (await response.json()) as T;
}

export const getHealth = () => request<HealthResponse>("/health");
export const getModels = () => request<ModelInfo[]>("/models");
export const getCategories = () => request<TaxonomyItem[]>("/taxonomy/categories");
export const getResolutions = () => request<TaxonomyItem[]>("/taxonomy/resolutions");
export const getTelemetrySummary = () => request<TelemetrySummary>("/telemetry/summary");
export const saveCategories = (items: TaxonomyItem[]) => request<TaxonomyItem[]>("/taxonomy/categories", { method: "POST", body: JSON.stringify(items) });
export const saveResolutions = (items: TaxonomyItem[]) => request<TaxonomyItem[]>("/taxonomy/resolutions", { method: "POST", body: JSON.stringify(items) });
export const categorizeCases = (modelId: string, cases: CaseRecord[]) => request<CategorizedCase[]>("/categorize", { method: "POST", body: JSON.stringify({ modelId, cases }) });
