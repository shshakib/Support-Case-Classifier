import { Activity, Check, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getTelemetrySummary } from "../api/client";
import type { ModelInfo, TaxonomyItem, TelemetrySummary } from "../types";


interface SettingsPageProps {
  categories: TaxonomyItem[];
  resolutions: TaxonomyItem[];
  models: ModelInfo[];
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
  onSaveTaxonomy: (kind: "categories" | "resolutions", items: TaxonomyItem[]) => Promise<void>;
}

interface DraftItem extends TaxonomyItem { key: string; }


function createDraft(item: TaxonomyItem): DraftItem {
  return { ...item, key: crypto.randomUUID() };
}


function validateItems(items: DraftItem[]): string | null {
  if (!items.length) return "At least one item is required.";
  if (items.some((item) => !item.name.trim() || !item.description.trim())) {
    return "Every item needs a name and description.";
  }
  const names = items.map((item) => item.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return "Names must be unique.";
  return null;
}


export default function SettingsPage({
  categories,
  resolutions,
  models,
  selectedModelId,
  onSelectModel,
  onSaveTaxonomy,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<"categories" | "resolutions">("categories");
  const [categoryDrafts, setCategoryDrafts] = useState<DraftItem[]>(() => categories.map(createDraft));
  const [resolutionDrafts, setResolutionDrafts] = useState<DraftItem[]>(() => resolutions.map(createDraft));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetrySummary | null>(null);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);

  useEffect(() => setCategoryDrafts(categories.map(createDraft)), [categories]);
  useEffect(() => setResolutionDrafts(resolutions.map(createDraft)), [resolutions]);

  const loadTelemetry = async () => {
    setTelemetryError(null);
    try {
      setTelemetry(await getTelemetrySummary());
    } catch (error) {
      setTelemetryError(error instanceof Error ? error.message : "Telemetry could not be loaded.");
    }
  };

  useEffect(() => { void loadTelemetry(); }, []);

  const drafts = activeTab === "categories" ? categoryDrafts : resolutionDrafts;
  const setDrafts = activeTab === "categories" ? setCategoryDrafts : setResolutionDrafts;
  const sourceItems = activeTab === "categories" ? categories : resolutions;
  const cleanDrafts = useMemo(
    () => drafts.map(({ name, description }) => ({ name: name.trim(), description: description.trim() })),
    [drafts],
  );
  const isDirty = JSON.stringify(cleanDrafts) !== JSON.stringify(sourceItems);
  const validationError = validateItems(drafts);

  const updateDraft = (key: string, field: keyof TaxonomyItem, value: string) => {
    setDrafts((current) => current.map((item) => item.key === key ? { ...item, [field]: value } : item));
    setSaveState("idle");
    setSaveError(null);
  };

  const save = async () => {
    if (validationError) return;
    setSaveState("saving");
    setSaveError(null);
    try {
      await onSaveTaxonomy(activeTab, cleanDrafts);
      setSaveState("saved");
    } catch (error) {
      setSaveState("idle");
      setSaveError(error instanceof Error ? error.message : "Changes could not be saved.");
    }
  };

  return (
    <div className="page-stack settings-page">
      <div className="page-header"><div><p className="eyebrow">Local configuration</p><h1>Settings</h1></div></div>

      <section className="settings-section">
        <div className="section-heading"><div><h2>Classification model</h2><p>The selected model is remembered in this browser.</p></div></div>
        <div className="model-list">
          {models.map((model) => (
            <label className={`model-option ${selectedModelId === model.id ? "selected" : ""}`} key={model.id}>
              <input type="radio" name="model" value={model.id} checked={selectedModelId === model.id} onChange={() => onSelectModel(model.id)} />
              <span className="model-radio" aria-hidden="true">{selectedModelId === model.id && <Check size={14} />}</span>
              <span className="model-copy"><strong>{model.displayName}</strong><span>{model.modelName} · concurrency {model.maxConcurrency}</span></span>
              <span className={`badge ${model.configured ? "badge-success" : "badge-muted"}`}>{model.local ? "Local" : model.configured ? "Configured" : "API key required"}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="settings-section taxonomy-section">
        <div className="section-heading settings-heading">
          <div><h2>Taxonomy</h2><p>Names are enforced as the model's allowed outputs.</p></div>
          <div className="settings-actions">
            {saveState === "saved" && <span className="saved-label"><Check size={15} /> Saved</span>}
            <button className="button button-primary" disabled={!isDirty || Boolean(validationError) || saveState === "saving"} onClick={() => void save()}>
              {saveState === "saving" ? <span className="spinner" /> : <Save size={16} />}Save changes
            </button>
          </div>
        </div>

        <div className="segmented-control" role="tablist" aria-label="Taxonomy type">
          <button role="tab" aria-selected={activeTab === "categories"} onClick={() => setActiveTab("categories")}>Categories <span>{categories.length}</span></button>
          <button role="tab" aria-selected={activeTab === "resolutions"} onClick={() => setActiveTab("resolutions")}>Resolutions <span>{resolutions.length}</span></button>
        </div>

        {(validationError || saveError) && <div className="notice notice-error"><Activity size={17} />{validationError ?? saveError}</div>}

        <div className="taxonomy-editor">
          <div className="taxonomy-header"><span>Name</span><span>Description</span><span>Action</span></div>
          {drafts.map((item) => (
            <div className="taxonomy-row" key={item.key}>
              <input value={item.name} onChange={(event) => updateDraft(item.key, "name", event.target.value)} aria-label="Taxonomy name" />
              <textarea value={item.description} onChange={(event) => updateDraft(item.key, "description", event.target.value)} rows={2} aria-label="Taxonomy description" />
              <button className="icon-button danger" onClick={() => setDrafts((current) => current.filter((candidate) => candidate.key !== item.key))} title="Remove item"><Trash2 size={17} /></button>
            </div>
          ))}
        </div>
        <button className="button button-secondary add-item-button" onClick={() => setDrafts((current) => [...current, createDraft({ name: "", description: "" })])}>
          <Plus size={16} />Add {activeTab === "categories" ? "category" : "resolution"}
        </button>
      </section>

      <section className="settings-section telemetry-section">
        <div className="section-heading settings-heading">
          <div><h2>Local telemetry</h2><p>Aggregate data from Backend/logs/telemetry.jsonl. Case content is never recorded.</p></div>
          <button className="icon-button" onClick={() => void loadTelemetry()} title="Refresh telemetry"><RefreshCw size={17} /></button>
        </div>
        {telemetryError && <div className="notice notice-error">{telemetryError}</div>}
        {telemetry && (
          <div className="telemetry-grid">
            <div><strong>{telemetry.totalBatches}</strong><span>Batches</span></div>
            <div><strong>{telemetry.totalCases}</strong><span>Cases</span></div>
            <div><strong>{telemetry.errorCount}</strong><span>Errors</span></div>
            <div><strong>{telemetry.averageBatchDurationMs} ms</strong><span>Average batch</span></div>
            <div><strong>{telemetry.inputTokens + telemetry.outputTokens}</strong><span>Tokens reported</span></div>
          </div>
        )}
      </section>
    </div>
  );
}
