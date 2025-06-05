// src/components/CaseCategorizationApp.tsx
import { useEffect, useState } from "react";
import Papa from "papaparse";

interface Category {
  name: string;
  description: string;
}

interface Case {
  Title: string;
  Description: string;
  [key: string]: any;
  extra_fields?: Record<string, any>;
}

interface CategorizedCase {
  originalCase: Case;
  predictedCategory: string;
  predictedResolution: string;
  predictedCertainty: string;
  predictedReasoning: string;
  error?: string;
}

interface CaseCategorizationAppProps {
  productCategories: Category[];
  resolutionTypes: Category[];
  selectedModel: string;
}

export default function CaseCategorizationApp({
  productCategories,
  resolutionTypes,
  selectedModel,
}: CaseCategorizationAppProps) {
  const [csvData, setCsvData] = useState<Case[]>([]);
  const [categorizedResults, setCategorizedResults] = useState<CategorizedCase[]>([]);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [categorizationError, setCategorizationError] = useState<string | null>(null);

  const BASE_URL = "http://localhost:8000";

  // Removed useEffect for fetching categories/resolutions here as it's now handled by App.tsx

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setCsvData([]);
      return;
    }
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setCsvData(results.data as Case[]);
        setCategorizedResults([]);
        setCategorizationError(null);
      },
      error: (err: Error) => {
        console.error("Error parsing CSV:", err.message);
        alert("Error parsing CSV file. Please check file format.");
        setCsvData([]);
      }
    });
  };

  const handleCategorizeCases = async () => {
    if (csvData.length === 0) {
      alert("Please upload a CSV file first.");
      return;
    }
    if (productCategories.length === 0 && resolutionTypes.length === 0) {
        alert("Please define some categories or resolution types in settings first.");
        return;
    }
    if (!selectedModel) {
        alert("Please select an LLM model in settings first.");
        return;
    }

    setIsCategorizing(true);
    setCategorizationError(null);
    setCategorizedResults([]);

    try {
      const response = await fetch(`${BASE_URL}/categorize-cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cases: csvData,
          availableCategories: productCategories,
          availableResolutions: resolutionTypes,
          selectedModel: selectedModel,
        }),
      });

      if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch (e) {
            throw new Error(`Categorization failed: ${response.status} - ${response.statusText}`);
        }

        let errorMessage = `Categorization failed: ${response.statusText}`;

        if (errorData && errorData.detail) {
            if (Array.isArray(errorData.detail) && errorData.detail.length > 0) {
                errorMessage = errorData.detail.map((err: any) => {
                    const loc = err.loc ? err.loc.join('.') : 'unknown';
                    return `${loc}: ${err.msg}`;
                }).join('; ');
            } else if (typeof errorData.detail === 'string') {
                errorMessage = errorData.detail;
            } else {
                errorMessage = JSON.stringify(errorData.detail);
            }
        }
        throw new Error(errorMessage);
      }

      const results: CategorizedCase[] = await response.json();
      setCategorizedResults(results);

    } catch (error: any) {
      console.error("Error during categorization:", error);
      setCategorizationError(error.message || "An unknown error occurred during categorization.");
    } finally {
      setIsCategorizing(false);
    }
  };

  const handleExportResults = () => {
    if (categorizedResults.length === 0) {
      alert("No results to export.");
      return;
    }

    const exportData = categorizedResults.map(res => {
      const caseId = getCaseIdFromOriginalCase(res.originalCase);

      const row: Record<string, any> = {
        "Case ID": caseId,
        ...res.originalCase,
        "LLM Predicted Category": res.predictedCategory,
        "LLM Predicted Resolution": res.predictedResolution,
        "LLM Certainty": res.predictedCertainty,
        "LLM Reasoning": res.predictedReasoning,
        "Processing Error": res.error || "",
      };

      if (row.extra_fields) {
          delete row.extra_fields;
      }
      return row;
    });

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'categorized_cases.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getCaseIdFromOriginalCase = (caseItem: Case): string => {
    const idVariants = [
      'caseid', 'case_id', 'id', 'ticketid', 'ticket_id', 'case id', 'ticket id' // Added more variants
    ];

    for (const key of Object.keys(caseItem)) {
      const normalized = key.toLowerCase().replace(/\s/g, ''); // Normalize by removing spaces
      if (idVariants.includes(normalized) && typeof caseItem[key] === 'string' && caseItem[key].trim() !== '') {
        return caseItem[key];
      }
    }

    if (caseItem.extra_fields) {
        for (const key of Object.keys(caseItem.extra_fields)) {
            const normalized = key.toLowerCase().replace(/\s/g, '');
            if (idVariants.includes(normalized) && typeof caseItem.extra_fields[key] === 'string' && caseItem.extra_fields[key].trim() !== '') {
                return caseItem.extra_fields[key];
            }
        }
    }
    return `Case: ${caseItem.Title?.substring(0, 30) || 'N/A'}${caseItem.Title && caseItem.Title.length > 30 ? '...' : ''}`;
  };


  return (
    <div className="min-h-screen bg-gray-900 text-gray-50 p-6 sm:p-8 lg:p-12 font-sans">
      <div className="max-w-6xl mx-auto space-y-10">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-center text-blue-400 mb-10">
          Case Categorization Tool
        </h1>

        {/* File Upload Section */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-4">
          <label htmlFor="csv-upload" className="block text-lg font-medium text-gray-200">
            Upload Cases CSV:
          </label>
          <input
            id="csv-upload"
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="block w-full text-sm text-gray-400
                       file:mr-4 file:py-2 file:px-4
                       file:rounded-md file:border-0
                       file:text-sm file:font-semibold
                       file:bg-blue-600 file:text-white
                       hover:file:bg-blue-700 transition cursor-pointer"
          />
        </div>

        {/* Categorize Button (Model Selection removed) */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg flex justify-center">
          {csvData.length > 0 && (
            <button
              type="button"
              onClick={handleCategorizeCases}
              className={`px-8 py-2.5 rounded-lg text-white font-bold text-lg tracking-wide transition-all duration-300
                         ${isCategorizing ? 'bg-gray-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 shadow-md hover:shadow-lg'}`}
              disabled={isCategorizing || csvData.length === 0 || productCategories.length === 0 || resolutionTypes.length === 0 || !selectedModel}
            >
              {isCategorizing ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-t-2 border-white border-t-green-200 mr-2"></div>
                  Processing...
                </div>
              ) : (
                'Categorize Cases'
              )}
            </button>
          )}
        </div>

        {/* Display CSV Data (if uploaded) */}
        {csvData.length > 0 && (
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold text-gray-100 mb-4">Uploaded Cases Preview ({csvData.length} rows)</h2>
            <div className="overflow-auto max-h-[400px] border border-gray-700 rounded-md shadow-inner">
              <table className="w-full text-sm border-collapse"> {/* Added border-collapse */}
                <thead className="sticky top-0 bg-gray-700 text-gray-200">
                  <tr>
                    {Object.keys(csvData[0]).map((key) => (
                      <th key={key} className="py-2 px-3 text-left whitespace-nowrap border border-gray-600"> {/* Added border */}
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-gray-800 divide-y divide-gray-700">
                  {csvData.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-700 transition">
                      {Object.values(row).map((val, j) => (
                        <td key={j} className="py-2 px-3 border border-gray-700 text-gray-300"> {/* Added border */}
                          {String(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- Display Categorization Results --- */}
        {isCategorizing && (
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg text-center text-blue-400 font-semibold text-lg">
            <div className="animate-spin inline-block w-8 h-8 border-4 border-t-4 border-blue-200 rounded-full border-t-blue-600"></div>
            <p className="mt-3">Processing cases with LLM...</p>
          </div>
        )}

        {categorizationError && (
          <div className="bg-red-900 p-6 rounded-lg shadow-lg text-red-200 border border-red-700">
            <p className="font-bold text-lg mb-2">Categorization Error:</p>
            <p>{categorizationError}</p>
            <p className="text-sm mt-3 text-red-300">Please ensure your Python backend is running and check its console for detailed error messages.</p>
          </div>
        )}

        {categorizedResults.length > 0 && (
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold text-gray-100 mb-4">Categorization Results ({categorizedResults.length} cases)</h2>
            <button
              type="button"
              onClick={handleExportResults}
              className="mb-6 px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition shadow-md"
            >
              Export Results to CSV
            </button>
            <div className="overflow-auto max-h-[600px] border border-gray-700 rounded-md shadow-inner">
              <table className="w-full text-sm border-collapse"> {/* Added border-collapse */}
                <thead className="sticky top-0 bg-blue-600 text-white">
                  <tr>
                    <th className="py-2 px-3 text-left w-[8%] min-w-[100px] border border-blue-700">Case ID</th> {/* Added border */}
                    <th className="py-2 px-3 text-left w-[15%] min-w-[180px] border border-blue-700">Original Case (Title & Desc)</th> {/* Added border */}
                    {csvData.length > 0 && csvData[0]["Predicted Category"] && (
                      <th className="py-2 px-3 text-left w-[10%] min-w-[120px] border border-blue-700">Original Category</th>
                    )}
                    {csvData.length > 0 && csvData[0]["Predicted Resolution"] && (
                      <th className="py-2 px-3 text-left w-[10%] min-w-[120px] border border-blue-700">Original Resolution</th>
                    )}
                    <th className="py-2 px-3 text-left w-[10%] min-w-[120px] border border-blue-700">LLM Category</th>
                    <th className="py-2 px-3 text-left w-[10%] min-w-[120px] border border-blue-700">LLM Resolution</th>
                    <th className="py-2 px-3 text-left w-[8%] min-w-[80px] border border-blue-700">Certainty</th>
                    <th className="py-2 px-3 text-left w-[25%] min-w-[200px] border border-blue-700">Reasoning</th>
                    <th className="py-2 px-3 text-left w-[7%] min-w-[70px] border border-blue-700">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-gray-800 divide-y divide-gray-700">
                  {categorizedResults.map((result, i) => (
                    <tr key={i} className="hover:bg-gray-700 transition">
                      <td className="py-2 px-3 align-top text-xs text-gray-300 font-semibold border border-gray-700">
                        {getCaseIdFromOriginalCase(result.originalCase)}
                      </td>
                      <td className="py-2 px-3 align-top text-xs text-gray-300 border border-gray-700">
                        <p className="font-semibold">{result.originalCase.Title}</p>
                        <p className="text-gray-400 line-clamp-3">{result.originalCase.Description}</p>
                      </td>
                      {result.originalCase["Predicted Category"] && (
                        <td className="py-2 px-3 align-top text-xs text-gray-400 border border-gray-700">
                          {result.originalCase["Predicted Category"]}
                        </td>
                      )}
                      {result.originalCase["Predicted Resolution"] && (
                        <td className="py-2 px-3 align-top text-xs text-gray-400 border border-gray-700">
                          {result.originalCase["Predicted Resolution"]}
                        </td>
                      )}
                      <td className={`py-2 px-3 align-top font-medium ${result.predictedCategory === 'Error' ? 'text-red-400' : 'text-green-400'} border border-gray-700`}>
                        {result.predictedCategory}
                      </td>
                      <td className={`py-2 px-3 align-top font-medium ${result.predictedResolution === 'Error' ? 'text-red-400' : 'text-purple-400'} border border-gray-700`}>
                        {result.predictedResolution}
                      </td>
                      <td className="py-2 px-3 align-top text-sm text-gray-300 border border-gray-700">
                        {result.predictedCertainty}
                      </td>
                      <td className="py-2 px-3 align-top text-xs text-gray-300 border border-gray-700">
                        {result.predictedReasoning}
                      </td>
                      <td className="py-2 px-3 align-top text-center text-xs border border-gray-700">
                        {result.error ? (
                          <span className="text-red-400 font-semibold">Error</span>
                        ) : (
                          <span className="text-green-400 font-semibold">Success</span>
                        )}
                        {result.error && <p className="text-gray-500 mt-1">{result.error.split(':')[0]}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}