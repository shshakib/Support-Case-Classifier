// src/App.tsx
import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import CaseCategorizationApp from './components/CaseCategorizationApp';
import SettingsPage from './components/SettingsPage';

interface Category {
  name: string;
  description: string;
}

const BASE_URL = "http://localhost:8000";

function App() {
  const [productCategories, setProductCategories] = useState<Category[]>([]);
  const [resolutionTypes, setResolutionTypes] = useState<Category[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('openai');
  const [loadingInitialData, setLoadingInitialData] = useState(true);
  const [initialDataError, setInitialDataError] = useState<string | null>(null);


  // Effect to load initial categories and resolutions on component mount
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoadingInitialData(true);
        setInitialDataError(null);
        const [categoriesRes, resolutionsRes] = await Promise.all([
          fetch(`${BASE_URL}/categories`),
          fetch(`${BASE_URL}/resolutions`),
        ]);

        if (!categoriesRes.ok || !resolutionsRes.ok) {
          throw new Error(`HTTP error! status: ${categoriesRes.status} / ${resolutionsRes.status}`);
        }

        const categoriesData = await categoriesRes.json();
        const resolutionsData = await resolutionsRes.json();

        setProductCategories(categoriesData);
        setResolutionTypes(resolutionsData);
      } catch (error: any) {
        console.error("Failed to fetch initial data:", error);
        setInitialDataError(`Failed to load initial settings: ${error.message}. Please ensure your backend is running.`);
      } finally {
        setLoadingInitialData(false);
      }
    };

    fetchInitialData();
  }, []);

  if (loadingInitialData) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin inline-block w-10 h-10 border-4 border-t-4 border-blue-200 rounded-full border-t-blue-600"></div>
          <p className="mt-4 text-xl">Loading application settings...</p>
        </div>
      </div>
    );
  }

  if (initialDataError) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-50 flex items-center justify-center p-6">
        <div className="bg-red-900 p-8 rounded-lg shadow-lg text-red-200 border border-red-700 text-center">
          <p className="font-bold text-2xl mb-4">Application Error</p>
          <p className="text-lg">{initialDataError}</p>
          <p className="mt-4 text-sm text-red-300">Please check your backend server and refresh the page.</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="flex flex-col min-h-screen bg-gray-900">
        {/* Navigation Bar */}
        <nav className="bg-gray-800 p-4 shadow-md">
          <div className="max-w-6xl mx-auto flex justify-between items-center">
            <Link to="/" className="text-2xl font-bold text-blue-400 hover:text-blue-300 transition">
              Case Categorizer
            </Link>
            <div>
              <Link
                to="/"
                className="px-4 py-2 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white transition mr-2"
              >
                Categorization
              </Link>
              <Link
                to="/settings"
                className="px-4 py-2 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white transition"
              >
                Settings
              </Link>
            </div>
          </div>
        </nav>

        {/* Main Content Area with Routes */}
        <div className="flex-grow">
          <Routes>
            <Route
              path="/"
              element={
                <CaseCategorizationApp
                  productCategories={productCategories}
                  resolutionTypes={resolutionTypes}
                  selectedModel={selectedModel}
                />
              }
            />
            <Route
              path="/settings"
              element={
                <SettingsPage
                  productCategories={productCategories}
                  setProductCategories={setProductCategories}
                  resolutionTypes={resolutionTypes}
                  setResolutionTypes={setResolutionTypes}
                  selectedModel={selectedModel}
                  setSelectedModel={setSelectedModel}
                />
              }
            />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;