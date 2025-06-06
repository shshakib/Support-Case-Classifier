import { useState } from "react";
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
        setCategorizationError("Error parsing CSV file. Please check file format.");
        setCsvData([]);
      }
    });
  };

  const handleCategorizeCases = async () => {
    if (csvData.length === 0) {
      setCategorizationError("Please upload a CSV file first.");
      return;
    }
    if (productCategories.length === 0 && resolutionTypes.length === 0) {
        setCategorizationError("Please define some categories or resolution types in settings first.");
        return;
    }
    if (!selectedModel) {
        setCategorizationError("Please select an LLM model in settings first.");
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
      alert("No results to export."); // Consider a more styled alert
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
      'caseid', 'case_id', 'id', 'ticketid', 'ticket_id', 'case id', 'ticket id'
    ];

    for (const key of Object.keys(caseItem)) {
      const normalized = key.toLowerCase().replace(/\s/g, '');
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
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 sm:p-8 lg:p-12 font-sans">
      <div className="max-w-7xl mx-auto space-y-10"> {/* Wider max-width, generous spacing */}
        <h1 className="text-5xl sm:text-6xl font-extrabold text-center text-blue-400 leading-tight mb-10 drop-shadow-lg">
          Automated Case Categorization
        </h1>

        {/* File Upload Section */}
        <div className="bg-gray-850 p-8 rounded-xl shadow-xl border border-gray-700 space-y-6"> {/* Enhanced card styling */}
          <label htmlFor="csv-upload" className="block text-xl font-semibold text-gray-200 mb-2">
            Upload Cases CSV:
          </label>
          <input
            id="csv-upload"
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="block w-full text-base text-gray-300
                       file:mr-4 file:py-2.5 file:px-6
                       file:rounded-lg file:border-0
                       file:text-base file:font-semibold
                       file:bg-blue-600 file:text-white
                       hover:file:bg-blue-700 transition-colors duration-300
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-850 cursor-pointer"
          />
        </div>

        {/* Categorize Button */}
        <div className="bg-gray-850 p-8 rounded-xl shadow-xl border border-gray-700 flex justify-center">
          {csvData.length > 0 && (
            <button
              type="button"
              onClick={handleCategorizeCases}
              className={`px-10 py-3 rounded-xl text-white font-bold text-xl tracking-wide transition-all duration-300
                         ${isCategorizing ? 'bg-gray-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'}
                         focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-850`}
              disabled={isCategorizing || csvData.length === 0 || productCategories.length === 0 || resolutionTypes.length === 0 || !selectedModel}
            >
              {isCategorizing ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-t-2 border-white border-t-green-200 mr-3"></div>
                  Processing Cases...
                </div>
              ) : (
                'Categorize Cases'
              )}
            </button>
          )}
        </div>

        {/* Display CSV Data (if uploaded) */}
        {csvData.length > 0 && (
          <div className="bg-gray-850 p-8 rounded-xl shadow-xl border border-gray-700">
            <h2 className="text-2xl font-bold text-gray-100 mb-6">Uploaded Cases Preview ({csvData.length} rows)</h2>
            <div className="overflow-x-auto overflow-y-auto max-h-[450px] border border-gray-700 rounded-lg shadow-inner">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-gray-700 text-gray-200">
                  <tr>
                    {Object.keys(csvData[0]).map((key) => (
                      <th key={key} className="py-3 px-4 text-left whitespace-nowrap border border-gray-600 font-semibold text-base">
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-gray-800 divide-y divide-gray-700">
                  {csvData.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-gray-800" : "bg-gray-750"}> {/* Zebra striping */}
                      {Object.values(row).map((val, j) => (
                        <td key={j} className="py-2.5 px-4 border border-gray-700 text-gray-300">
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
          <div className="bg-blue-900 bg-opacity-30 p-8 rounded-xl shadow-xl text-blue-300 font-semibold text-xl flex items-center justify-center animate-pulse">
            <div className="animate-spin inline-block w-10 h-10 border-4 border-t-4 border-blue-200 rounded-full border-t-blue-600 mr-4"></div>
            <p>Processing cases with LLM. This may take a moment...</p>
          </div>
        )}

        {categorizationError && (
          <div className="bg-red-900 p-8 rounded-xl shadow-xl text-red-100 border border-red-700">
            <p className="font-bold text-xl mb-3">Categorization Error:</p>
            <p className="text-base">{categorizationError}</p>
            <p className="text-sm mt-4 text-red-300">Please ensure your Python backend is running and check its console for detailed error messages.</p>
          </div>
        )}

        {categorizedResults.length > 0 && (
          <div className="bg-gray-850 p-8 rounded-xl shadow-xl border border-gray-700">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-100">Categorization Results ({categorizedResults.length} cases)</h2>
                <button
                type="button"
                onClick={handleExportResults}
                className="px-7 py-2.5 bg-blue-600 text-white text-base font-semibold rounded-lg hover:bg-blue-700 transition-colors duration-200 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-850"
                >
                Export Results to CSV
                </button>
            </div>
            <div className="overflow-x-auto overflow-y-auto max-h-[600px] border border-gray-700 rounded-lg shadow-inner">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-blue-700 text-white shadow-md"> {/* Darker blue for results header */}
                  <tr>
                    <th className="py-3 px-4 text-left w-[8%] min-w-[100px] border border-blue-800 font-semibold text-base">Case ID</th>
                    <th className="py-3 px-4 text-left w-[15%] min-w-[180px] border border-blue-800 font-semibold text-base">Original Case</th>
                    {csvData.length > 0 && csvData[0]["Predicted Category"] && (
                      <th className="py-3 px-4 text-left w-[10%] min-w-[120px] border border-blue-800 font-semibold text-base">Original Category</th>
                    )}
                    {csvData.length > 0 && csvData[0]["Predicted Resolution"] && (
                      <th className="py-3 px-4 text-left w-[10%] min-w-[120px] border border-blue-800 font-semibold text-base">Original Resolution</th>
                    )}
                    <th className="py-3 px-4 text-left w-[10%] min-w-[120px] border border-blue-800 font-semibold text-base">LLM Category</th>
                    <th className="py-3 px-4 text-left w-[10%] min-w-[120px] border border-blue-800 font-semibold text-base">LLM Resolution</th>
                    <th className="py-3 px-4 text-left w-[8%] min-w-[80px] border border-blue-800 font-semibold text-base">Certainty</th>
                    <th className="py-3 px-4 text-left w-[25%] min-w-[200px] border border-blue-800 font-semibold text-base">Reasoning</th>
                    <th className="py-3 px-4 text-left w-[7%] min-w-[70px] border border-blue-800 font-semibold text-base">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-gray-800 divide-y divide-gray-700">
                  {categorizedResults.map((result, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-gray-800" : "bg-gray-850"}> {/* Zebra striping for results */}
                      <td className="py-2.5 px-4 align-top text-xs text-gray-300 font-semibold border border-gray-700">
                        {getCaseIdFromOriginalCase(result.originalCase)}
                      </td>
                      <td className="py-2.5 px-4 align-top text-xs text-gray-300 border border-gray-700">
                        <p className="font-semibold text-sm mb-1">{result.originalCase.Title}</p>
                        <p className="text-gray-400 line-clamp-3">{result.originalCase.Description}</p>
                      </td>
                      {result.originalCase["Predicted Category"] && (
                        <td className="py-2.5 px-4 align-top text-xs text-gray-400 border border-gray-700">
                          {result.originalCase["Predicted Category"]}
                        </td>
                      )}
                      {result.originalCase["Predicted Resolution"] && (
                        <td className="py-2.5 px-4 align-top text-xs text-gray-400 border border-gray-700">
                          {result.originalCase["Predicted Resolution"]}
                        </td>
                      )}
                      <td className={`py-2.5 px-4 align-top font-medium ${result.predictedCategory === 'Error' ? 'text-red-400' : 'text-green-400'} border border-gray-700`}>
                        {result.predictedCategory}
                      </td>
                      <td className={`py-2.5 px-4 align-top font-medium ${result.predictedResolution === 'Error' ? 'text-red-400' : 'text-purple-400'} border border-gray-700`}>
                        {result.predictedResolution}
                      </td>
                      <td className="py-2.5 px-4 align-top text-sm text-gray-300 border border-gray-700">
                        {result.predictedCertainty}
                      </td>
                      <td className="py-2.5 px-4 align-top text-xs text-gray-300 border border-gray-700">
                        {result.predictedReasoning}
                      </td>
                      <td className="py-2.5 px-4 align-top text-center text-xs border border-gray-700">
                        {result.error ? (
                          <span className="text-red-400 font-semibold text-sm">Error</span>
                        ) : (
                          <span className="text-green-400 font-semibold text-sm">Success</span>
                        )}
                        {result.error && <p className="text-gray-500 text-xs mt-1">{result.error.split(':')[0]}</p>}
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