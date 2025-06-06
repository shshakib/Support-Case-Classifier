import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'; // Import useLocation
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
      <div className="min-h-screen bg-gray-950 text-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin inline-block w-12 h-12 border-4 border-t-4 border-blue-400 rounded-full border-t-blue-700"></div>
          <p className="mt-4 text-xl text-blue-300 font-semibold">Loading application settings...</p>
        </div>
      </div>
    );
  }

  if (initialDataError) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-50 flex items-center justify-center p-6">
        <div className="bg-red-900 p-8 rounded-lg shadow-xl text-red-100 border border-red-700 text-center">
          <p className="font-bold text-2xl mb-4">Application Error</p>
          <p className="text-lg">{initialDataError}</p>
          <p className="mt-4 text-sm text-red-300">Please check your backend server and refresh the page.</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="flex flex-col min-h-screen bg-gray-950"> {/* Deeper background color */}
        {/* Navigation Bar */}
        <nav className="bg-gray-850 p-4 shadow-lg border-b border-gray-700"> {/* Slightly lighter nav background, stronger shadow */}
          <div className="max-w-7xl mx-auto flex justify-between items-center"> {/* Wider max-width */}
            <Link to="/" className="text-3xl font-extrabold text-blue-400 hover:text-blue-300 transition-colors duration-200">
              Case Classifier
            </Link>
            <div className="flex space-x-6">
              <NavLink to="/settings" label="Settings" />
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

// Helper component for navigation links to show active state
interface NavLinkProps {
    to: string;
    label: string;
    className?: string;
}

function NavLink({ to, label, className = '' }: NavLinkProps) {
    const location = useLocation();
    const isActive = location.pathname === to;

    return (
        <Link
            to={to}
            className={`
                px-5 py-2 rounded-md font-medium text-lg transition-all duration-200
                ${isActive
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }
                ${className}
            `}
        >
            {label}
        </Link>
    );
}

export default App;