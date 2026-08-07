import { useCallback, useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { Activity, Settings, TableProperties } from "lucide-react";

import {
  getCategories,
  getHealth,
  getModels,
  getResolutions,
  saveCategories,
  saveResolutions,
} from "./api/client";
import ClassifierPage from "./components/ClassifierPage";
import SettingsPage from "./components/SettingsPage";
import type { ModelInfo, TaxonomyItem } from "./types";


const MODEL_STORAGE_KEY = "support-classifier-model";
type AppRoute = "/" | "/settings";


function currentRoute(): AppRoute {
  return window.location.pathname === "/settings" ? "/settings" : "/";
}


function App() {
  const [categories, setCategories] = useState<TaxonomyItem[]>([]);
  const [resolutions, setResolutions] = useState<TaxonomyItem[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [backendConnected, setBackendConnected] = useState(false);
  const [route, setRoute] = useState<AppRoute>(currentRoute);

  const loadApplication = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [health, loadedCategories, loadedResolutions, loadedModels] =
        await Promise.all([
          getHealth(),
          getCategories(),
          getResolutions(),
          getModels(),
        ]);
      setBackendConnected(health.status === "ok");
      setCategories(loadedCategories);
      setResolutions(loadedResolutions);
      setModels(loadedModels);
      setSelectedModelId((current) => {
        const stored = localStorage.getItem(MODEL_STORAGE_KEY);
        const candidate = current || stored;
        if (candidate && loadedModels.some((model) => model.id === candidate)) {
          return candidate;
        }
        return loadedModels.find((model) => model.configured)?.id ?? loadedModels[0]?.id ?? "";
      });
    } catch (error) {
      setBackendConnected(false);
      setLoadError(
        error instanceof Error
          ? error.message
          : "The application could not connect to the backend.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadApplication();
  }, [loadApplication]);

  useEffect(() => {
    const handlePopState = () => setRoute(currentRoute());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? null,
    [models, selectedModelId],
  );

  const selectModel = (modelId: string) => {
    setSelectedModelId(modelId);
    localStorage.setItem(MODEL_STORAGE_KEY, modelId);
  };

  const navigate = (event: MouseEvent<HTMLAnchorElement>, path: AppRoute) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
    setRoute(path);
  };

  const updateTaxonomy = async (
    kind: "categories" | "resolutions",
    items: TaxonomyItem[],
  ) => {
    if (kind === "categories") {
      setCategories(await saveCategories(items));
    } else {
      setResolutions(await saveResolutions(items));
    }
  };

  if (loading) {
    return (
      <div className="centered-state" role="status">
        <span className="spinner spinner-large" aria-hidden="true" />
        <h1>Case Classifier</h1>
        <p>Connecting to the local API...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="centered-state">
        <div className="state-icon state-icon-error" aria-hidden="true">
          <Activity size={24} />
        </div>
        <h1>Backend unavailable</h1>
        <p>{loadError}</p>
        <button className="button button-primary" onClick={() => void loadApplication()}>
          Retry connection
        </button>
      </div>
    );
  }

  return (
    <div className="app-shell">
        <header className="topbar">
          <div className="topbar-inner">
            <a className="brand" href="/" onClick={(event) => navigate(event, "/")} aria-label="Case Classifier workspace">
              <img src="/mark.svg" alt="" width="32" height="32" />
              <span>Case Classifier</span>
            </a>

            <nav className="primary-nav" aria-label="Primary navigation">
              <a className={route === "/" ? "active" : ""} href="/" onClick={(event) => navigate(event, "/")}>
                <TableProperties size={17} />
                Workspace
              </a>
              <a className={route === "/settings" ? "active" : ""} href="/settings" onClick={(event) => navigate(event, "/settings")}>
                <Settings size={17} />
                Settings
              </a>
            </nav>

            <div className="topbar-status">
              <span className={`status-dot ${backendConnected ? "online" : "offline"}`} />
              <span>{backendConnected ? "Local API online" : "API offline"}</span>
            </div>
          </div>
        </header>

        <main className="main-content">
          {route === "/" ? (
            <ClassifierPage
              categories={categories}
              resolutions={resolutions}
              models={models}
              selectedModel={selectedModel}
              onSelectModel={selectModel}
            />
          ) : (
            <SettingsPage
              categories={categories}
              resolutions={resolutions}
              models={models}
              selectedModelId={selectedModelId}
              onSelectModel={selectModel}
              onSaveTaxonomy={updateTaxonomy}
            />
          )}
        </main>
    </div>
  );
}


export default App;
