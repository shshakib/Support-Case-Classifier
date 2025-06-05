// src/components/SettingsPage.tsx
import React from 'react';
import { useState, useEffect } from 'react';

interface Category {
  name: string;
  description: string;
}

const MODELS = [
  { id: 'openai', name: 'OpenAI (GPT-4.1 nano)' },
  { id: 'gemini', name: 'Google Gemini (gemini-pro)' },
  { id: 'ollama', name: 'Local Ollama (llama3)' },
];

interface SettingsPageProps {
  productCategories: Category[];
  setProductCategories: React.Dispatch<React.SetStateAction<Category[]>>;
  resolutionTypes: Category[];
  setResolutionTypes: React.Dispatch<React.SetStateAction<Category[]>>;
  selectedModel: string;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;
}

export default function SettingsPage({
  productCategories,
  setProductCategories,
  resolutionTypes,
  setResolutionTypes,
  selectedModel,
  setSelectedModel,
}: SettingsPageProps) {
  const [showProductCategories, setShowProductCategories] = useState(false);
  const [showResolutionTypes, setShowResolutionTypes] = useState(false);

  const BASE_URL = "http://localhost:8000";

  const saveToServer = async (endpoint: string, data: Category[]) => {
    try {
      const response = await fetch(`${BASE_URL}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`Failed to save data. Status: ${response.status}`);
      }
      console.log(`Saved ${endpoint} successfully.`);
    } catch (error) {
      console.error(`Error saving to ${endpoint}:`, error);
      alert(`Failed to save ${endpoint}. Check console for details.`);
    }
  };

  const updateCategory = (
    index: number,
    key: keyof Category,
    value: string,
    type: "product" | "resolution"
  ) => {
    const list = type === "product" ? [...productCategories] : [...resolutionTypes];
    list[index][key] = value;

    if (type === "product") {
      setProductCategories(list);
    } else {
      setResolutionTypes(list);
    }
  };

  const handleBlur = (type: "product" | "resolution") => {
    const data = type === "product" ? productCategories : resolutionTypes;
    const endpoint = type === "product" ? "categories" : "resolutions";
    saveToServer(endpoint, data);
  };

  const addCategory = (type: "product" | "resolution") => {
    const newItem = { name: "", description: "" };
    if (type === "product") {
      const updated = [...productCategories, newItem];
      setProductCategories(updated);
      saveToServer("categories", updated);
    } else {
      const updated = [...resolutionTypes, newItem];
      setResolutionTypes(updated);
      saveToServer("resolutions", updated);
    }
  };

  const removeCategory = (index: number, type: "product" | "resolution") => {
    if (type === "product") {
      const updated = [...productCategories];
      updated.splice(index, 1);
      setProductCategories(updated);
      saveToServer("categories", updated);
    } else {
      const updated = [...resolutionTypes];
      updated.splice(index, 1);
      setResolutionTypes(updated);
      saveToServer("resolutions", updated);
    }
  };

  const renderSection = (
    type: "product" | "resolution",
    show: boolean,
    setShow: (v: boolean) => void
  ) => {
    const title = type === "product" ? "Product Categories" : "Resolution Types";
    const data = type === "product" ? productCategories : resolutionTypes;
    const nameLabel = type === "product" ? "Category Name" : "Resolution Name";
    const buttonLabel = type === "product" ? "+ Add Category" : "+ Add Resolution Type";

    return (
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
        <h2 className="text-xl font-bold text-gray-100 mb-4 flex items-center">
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="mr-2 w-5 h-5 flex items-center justify-center
                       rounded-full bg-blue-600 text-white font-bold text-sm
                       hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition"
            aria-expanded={show}
            aria-controls={`${type}-content`}
          >
            {show ? "−" : "+"}
          </button>
          {title}
        </h2>

        {show && (
          <div id={`${type}-content`} className="mt-4 space-y-4">
            <table className="min-w-full bg-gray-700 rounded-md overflow-hidden border-collapse"> {/* Added border-collapse */}
              <thead className="bg-gray-600 text-gray-200">
                <tr>
                  <th className="py-2 px-3 text-left text-sm font-semibold w-1/3 border border-gray-600">{nameLabel}</th> {/* Added border */}
                  <th className="py-2 px-3 text-left text-sm font-semibold w-1/2 border border-gray-600">Description</th> {/* Added border */}
                  <th className="py-2 px-3 text-center text-sm font-semibold w-[100px] border border-gray-600">Actions</th> {/* Added border */}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-600">
                {data.map((item, i) => (
                  <tr key={i} className="hover:bg-gray-650 transition">
                    <td className="py-1 px-3 align-top border border-gray-700"> {/* Added border */}
                      <textarea
                        value={item.name}
                        onChange={(e) => updateCategory(i, "name", e.target.value, type)}
                        onBlur={() => handleBlur(type)}
                        className="w-full h-auto px-2 py-1 bg-gray-700 text-gray-50 border border-gray-600 rounded-sm outline-none resize-y min-h-[36px] focus:border-blue-500 transition"
                        rows={1}
                      />
                    </td>
                    <td className="py-1 px-3 align-top border border-gray-700"> {/* Added border */}
                      <textarea
                        value={item.description}
                        onChange={(e) => updateCategory(i, "description", e.target.value, type)}
                        onBlur={() => handleBlur(type)}
                        className="w-full h-auto px-2 py-1 bg-gray-700 text-gray-50 border border-gray-600 rounded-sm outline-none resize-y min-h-[36px] focus:border-blue-500 transition"
                        rows={1}
                      />
                    </td>
                    <td className="py-1 px-3 text-center align-middle border border-gray-700"> {/* Added border */}
                      <button
                        type="button"
                        onClick={() => removeCategory(i, type)}
                        className="text-red-400 hover:text-red-300 text-xs font-medium px-2 py-1 rounded transition"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              onClick={() => addCategory(type)}
              className="mt-4 px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition shadow-md"
            >
              {buttonLabel}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-50 p-6 sm:p-8 lg:p-12 font-sans">
      <div className="max-w-6xl mx-auto space-y-10">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-center text-blue-400 mb-10">
          Application Settings
        </h1>

        {/* Model Selection */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-6">
          <div className="flex items-center space-x-3">
            <label htmlFor="model-select" className="block text-lg font-medium text-gray-200">
              Select LLM Model:
            </label>
            <select
              id="model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="block w-auto py-2 px-4 border border-gray-600 bg-gray-700 text-gray-50 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            >
              {MODELS.map(model => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Categories and Resolutions Sections */}
        {renderSection("product", showProductCategories, setShowProductCategories)}
        {renderSection("resolution", showResolutionTypes, setShowResolutionTypes)}
      </div>
    </div>
  );
}