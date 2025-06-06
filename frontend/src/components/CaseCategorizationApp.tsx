import { useState } from "react";
import Papa from "papaparse"; // Ensure papaparse and @types/papaparse are installed

// Interface for a single category or resolution type
interface Category {
  name: string;
  description: string;
}

// Interface for a single case from the CSV.
// These fields are expected and will be strongly typed.
// Any other fields from the CSV will go into `extra_fields`.
interface Case {
  CaseNumber: string;
  CaseTitle: string;
  Description: string;
  StatusReason: string;
  [key: string]: any; // Allows direct access to other properties from original CSV
  extra_fields?: Record<string, any>; // Explicitly define extra_fields if present
}

// Interface for the categorized result received from the backend
interface CategorizedCase {
  originalCase: Case; // This will now contain all original CSV fields, including any extra_fields
  predictedCategory: string;
  predictedResolution: string;
  predictedCertainty: string;
  predictedReasoning: string;
  error?: string; // For cases that might have failed categorization
}

// Props interface for the CaseCategorizationApp component
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
  // State to hold the parsed CSV data
  const [csvData, setCsvData] = useState<Case[]>([]);
  // State to hold the categorization results from the LLM
  const [categorizedResults, setCategorizedResults] = useState<CategorizedCase[]>([]);
  // State to manage the loading/categorizing process
  const [isCategorizing, setIsCategorizing] = useState(false);
  // State to hold any error messages related to file upload or categorization
  const [categorizationError, setCategorizationError] = useState<string | null>(null);

  // Base URL for your Python FastAPI backend
  const BASE_URL = "http://localhost:8000";

  /**
   * Handles the CSV file upload and parsing.
   * Uses PapaParse to parse the CSV, maps required fields, and collects
   * any additional columns into `extra_fields`.
   */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setCsvData([]);
      setCategorizationError(null); // Clear any previous errors on new file selection
      setCategorizedResults([]); // Clear any previous categorization results
      return;
    }

    // Use PapaParse to parse the CSV file
    Papa.parse<any>(file, { // Using 'any' here as PapaParse initially returns raw data
      header: true,         // Treat the first row as headers
      skipEmptyLines: true, // Ignore empty rows
      dynamicTyping: true,  // Attempt to convert values to appropriate types (e.g., numbers)
      complete: (results) => {
        const processedData: Case[] = [];
        let hasMissingEssentialColumns = false;

        // Process each row to map to the Case interface and collect extra fields
        results.data.forEach((row, rowIndex) => {
          // Check for essential columns (CaseNumber, CaseTitle, Description, StatusReason)
          const caseNumber = String(row['CaseNumber'] || '');
          const caseTitle = String(row['CaseTitle'] || '');
          const description = String(row['Description'] || '');
          const statusReason = String(row['StatusReason'] || '');

          if (!caseNumber || !caseTitle || !description || !statusReason) {
            console.warn(`Row ${rowIndex + 1} is missing essential columns. Skipping this row.`);
            hasMissingEssentialColumns = true;
            return; // Skip this row if essential columns are missing
          }

          const newCase: Case = {
            CaseNumber: caseNumber,
            CaseTitle: caseTitle,
            Description: description,
            StatusReason: statusReason,
            extra_fields: {} // Initialize extra_fields
          };

          // Collect any other columns into extra_fields
          for (const key in row) {
            // Check if the key is not one of the explicitly defined Case properties
            if (
              key !== "CaseNumber" &&
              key !== "CaseTitle" &&
              key !== "Description" &&
              key !== "StatusReason"
            ) {
              newCase.extra_fields![key] = row[key];
            }
          }
          processedData.push(newCase);
        });

        if (processedData.length === 0 && results.data.length > 0) {
          // If original data existed but nothing was processed, it means essential columns were missing
          setCategorizationError(
            "No valid cases found after parsing. Ensure your CSV has 'CaseNumber', 'CaseTitle', 'Description', and 'StatusReason' columns."
          );
        } else if (hasMissingEssentialColumns) {
            setCategorizationError(
                "Some rows were skipped due to missing essential columns ('CaseNumber', 'CaseTitle', 'Description', 'StatusReason')."
            );
        }
        else {
          setCategorizationError(null); // Clear error if parsing was successful
        }

        setCsvData(processedData);
        setCategorizedResults([]); // Clear old results when new data is loaded
      },
      error: (error) => {
        console.error("Error parsing CSV:", error);
        setCsvData([]);
        setCategorizationError("Failed to parse CSV file. Please check its format and ensure it's a valid CSV.");
      }
    });
  };

  /**
   * Sends the loaded CSV data to the backend for categorization.
   * Displays loading state, errors, or the categorized results.
   */
  const handleCategorize = async () => {
    if (csvData.length === 0) {
      setCategorizationError("No cases loaded to categorize. Please upload a CSV file first.");
      return;
    }
    if (productCategories.length === 0 || resolutionTypes.length === 0) {
      setCategorizationError("Please define product categories and resolution types in Settings first.");
      return;
    }
    if (!selectedModel) {
      setCategorizationError("Please select an LLM model in Settings first.");
      return;
    }

    setIsCategorizing(true);
    setCategorizationError(null); // Clear previous errors
    setCategorizedResults([]); // Clear previous results before starting new categorization

    try {
      const response = await fetch(`${BASE_URL}/categorize?model_name=${selectedModel}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // Send the raw parsed data to the backend. The backend's Pydantic model
        // will handle mapping to its `Case` model and collecting `extra_fields`.
        body: JSON.stringify(csvData.map(caseItem => ({
            CaseNumber: caseItem.CaseNumber,
            CaseTitle: caseItem.CaseTitle,
            Description: caseItem.Description,
            StatusReason: caseItem.StatusReason,
            ...caseItem.extra_fields // Spread any other original fields directly
        }))),
      });

      if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json(); // Attempt to parse JSON error response
        } catch (e) {
            // If response is not JSON, use status text
            throw new Error(`Categorization failed: ${response.status} - ${response.statusText}`);
        }

        let errorMessage = `Categorization failed: ${response.statusText}`;

        if (errorData && errorData.detail) {
            if (Array.isArray(errorData.detail) && errorData.detail.length > 0) {
                // If 'detail' is an array (common for Pydantic validation errors)
                errorMessage = errorData.detail.map((err: any) => {
                    const loc = err.loc ? err.loc.join('.') : 'unknown';
                    return `${loc}: ${err.msg}`;
                }).join('; ');
            } else if (typeof errorData.detail === 'string') {
                // If 'detail' is a string
                errorMessage = errorData.detail;
            } else {
                // Fallback for unexpected 'detail' structure (e.g., another object)
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
      // If a general error occurs during fetch, mark all cases as 'Error' in results
      setCategorizedResults(csvData.map(originalCase => ({
        originalCase: { ...originalCase, ...originalCase.extra_fields }, // Ensure all original fields are preserved
        predictedCategory: "Error",
        predictedResolution: "Error",
        predictedCertainty: "Error",
        predictedReasoning: "Error during processing.",
        error: error.message
      })));
    } finally {
      setIsCategorizing(false);
    }
  };

  /**
   * Exports the categorized results to a new CSV file.
   * Includes all original columns (including extra fields) and the LLM's predictions.
   */
  const handleDownloadResults = () => {
    if (categorizedResults.length === 0) {
      alert("No results to download."); // Consider a more styled alert
      return;
    }

    const exportData = categorizedResults.map(result => {
      const original = result.originalCase; // The originalCase property already contains all CSV fields

      const row: Record<string, any> = {
        // Explicitly include known fields first for consistent column order in export
        "CaseNumber": original.CaseNumber,
        "CaseTitle": original.CaseTitle,
        "Description": original.Description,
        "StatusReason": original.StatusReason,
        // Then spread any additional fields that were in the original CSV
        ...original.extra_fields,
        // Finally, add the LLM's predicted fields
        "LLM Predicted Category": result.predictedCategory,
        "LLM Predicted Resolution": result.predictedResolution,
        "LLM Certainty": result.predictedCertainty,
        "LLM Reasoning": result.predictedReasoning,
        "Processing Error": result.error || '', // Include error if any
      };
      return row;
    });

    // Use PapaParse to unparse the data back into CSV format
    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'categorized_cases.csv'); // Suggested filename
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href); // Clean up the URL object
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 sm:p-8 lg:p-12 font-sans">
      <div className="max-w-7xl mx-auto space-y-10"> {/* Wider max-width, generous spacing */}
        <h1 className="text-5xl sm:text-6xl font-extrabold text-center text-blue-400 leading-tight mb-10 drop-shadow-lg">
          Automated Case Categorization
        </h1>

        {/* File Upload Section */}
        <div className="bg-gray-850 p-8 rounded-xl shadow-xl border border-gray-700 space-y-6">
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
           {csvData.length > 0 && !categorizationError && (
            <p className="mt-4 text-green-400 text-sm font-medium">
              Successfully loaded {csvData.length} cases from your CSV.
            </p>
          )}
        </div>

        {/* --- NEW: Loaded Cases Preview Section --- */}
        {/* Show this section only if CSV data is loaded and categorization hasn't started/completed */}
        {csvData.length > 0 && categorizedResults.length === 0 && !isCategorizing && !categorizationError && (
            <div className="bg-gray-850 p-8 rounded-xl shadow-xl border border-gray-700">
                <h2 className="text-2xl font-bold text-gray-100 mb-6">Loaded Cases Preview ({csvData.length} rows)</h2>
                <div className="overflow-x-auto overflow-y-auto max-h-[450px] border border-gray-700 rounded-lg shadow-inner">
                    <table className="min-w-full divide-y divide-gray-700 border-collapse">
                        <thead className="sticky top-0 bg-gray-700 text-gray-200">
                            <tr>
                                {/* Dynamically render headers based on the first case's known fields */}
                                {csvData.length > 0 && ['CaseNumber', 'CaseTitle', 'Description', 'StatusReason'].map(key => (
                                    <th key={key} scope="col" className="py-3 px-4 text-left whitespace-nowrap border border-gray-600 font-semibold text-base">
                                        {/* Make camelCase more readable for display */}
                                        {key.replace(/([A-Z])/g, ' $1').trim()}
                                    </th>
                                ))}
                                {/* Dynamically render headers for extra fields if they exist in the first case */}
                                {csvData.length > 0 && csvData[0].extra_fields && Object.keys(csvData[0].extra_fields).map(key => (
                                    <th key={`extra-header-${key}`} scope="col" className="py-3 px-4 text-left whitespace-nowrap border border-gray-600 font-semibold text-base">
                                        {key.replace(/([A-Z])/g, ' $1').trim()}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800 bg-gray-900">
                            {csvData.map((caseItem, index) => (
                                <tr key={index} className={index % 2 === 0 ? "bg-gray-900" : "bg-gray-850"}> {/* Zebra striping */}
                                    {/* Render known fields */}
                                    <td className="py-2.5 px-4 align-top text-sm font-medium text-gray-300 border border-gray-700">
                                        {caseItem.CaseNumber}
                                    </td>
                                    <td className="py-2.5 px-4 align-top text-sm font-medium text-gray-300 border border-gray-700">
                                        {caseItem.CaseTitle}
                                    </td>
                                    <td className="py-2.5 px-4 align-top text-sm text-gray-300 border border-gray-700">
                                        {caseItem.Description}
                                    </td>
                                    <td className="py-2.5 px-4 align-top text-sm text-gray-300 border border-gray-700">
                                        {caseItem.StatusReason}
                                    </td>
                                    {/* Render extra fields data */}
                                    {caseItem.extra_fields && Object.keys(caseItem.extra_fields).map(key => (
                                        <td key={`${index}-extra-data-${key}`} className="py-2.5 px-4 align-top text-sm font-medium text-gray-300 border border-gray-700">
                                            {String(caseItem.extra_fields![key])}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}
        {/* --- END NEW SECTION --- */}


        {/* Actions Section (Categorize & Download) */}
        <div className="bg-gray-850 p-8 rounded-xl shadow-xl border border-gray-700">
          <h2 className="text-2xl font-semibold text-gray-100 mb-4">Perform Actions</h2>
          <div className="flex flex-col sm:flex-row items-center space-y-6 sm:space-y-0 sm:space-x-6"> {/* Increased spacing */}
            <button
              onClick={handleCategorize}
              disabled={isCategorizing || csvData.length === 0 || productCategories.length === 0 || resolutionTypes.length === 0 || !selectedModel}
              className={`flex-grow px-10 py-3 rounded-xl font-bold text-xl tracking-wide transition-all duration-300
                         ${isCategorizing || csvData.length === 0 || productCategories.length === 0 || resolutionTypes.length === 0 || !selectedModel
                           ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                           : 'bg-green-600 text-white hover:bg-green-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
                         } focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-850`}
            >
              {isCategorizing ? (
                <span className="flex items-center justify-center">
                  <div className="animate-spin inline-block w-6 h-6 border-2 border-t-2 border-white rounded-full border-t-blue-300 mr-3"></div>
                  Categorizing...
                </span>
              ) : (
                'Start Categorization'
              )}
            </button>
            <button
              onClick={handleDownloadResults}
              disabled={categorizedResults.length === 0}
              className={`flex-grow px-10 py-3 rounded-xl font-bold text-xl tracking-wide transition-all duration-300
                         ${categorizedResults.length === 0
                           ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                           : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
                         } focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-850`}
            >
              Download Results CSV
            </button>
          </div>
        </div>

        {/* Categorization Error Display */}
        {categorizationError && (
          <div className="bg-red-900 p-8 rounded-xl shadow-xl text-red-100 border border-red-700">
            <p className="font-bold text-xl mb-3">Categorization Error:</p>
            <p className="text-base">{categorizationError}</p>
            <p className="text-sm mt-4 text-red-300">Please ensure your Python backend is running, check console for errors, and verify CSV format.</p>
          </div>
        )}

        {/* Categorized Results Section */}
        {categorizedResults.length > 0 && (
          <div className="bg-gray-850 p-8 rounded-xl shadow-xl border border-gray-700">
            <h2 className="text-2xl font-bold text-gray-100 mb-6">Categorization Results ({categorizedResults.length} cases)</h2>
            <div className="overflow-x-auto overflow-y-auto max-h-[600px] border border-gray-700 rounded-lg shadow-inner">
              <table className="min-w-full divide-y divide-gray-700 border-collapse">
                <thead className="sticky top-0 bg-blue-700 text-white shadow-md">
                  <tr>
                    {/* Updated table headers to reflect CaseNumber, CaseTitle, Description, and LLM outputs */}
                    <th scope="col" className="py-3 px-4 text-left whitespace-nowrap border border-blue-800 font-semibold text-base">Case Number</th>
                    <th scope="col" className="py-3 px-4 text-left whitespace-nowrap border border-blue-800 font-semibold text-base">Case Title</th>
                    <th scope="col" className="py-3 px-4 text-left whitespace-nowrap border border-blue-800 font-semibold text-base">Description</th>
                    <th scope="col" className="py-3 px-4 text-left whitespace-nowrap border border-blue-800 font-semibold text-base">Status Reason</th>
                    <th scope="col" className="py-3 px-4 text-left whitespace-nowrap border border-blue-800 font-semibold text-base">Predicted Category</th>
                    <th scope="col" className="py-3 px-4 text-left whitespace-nowrap border border-blue-800 font-semibold text-base">Predicted Resolution</th>
                    <th scope="col" className="py-3 px-4 text-left whitespace-nowrap border border-blue-800 font-semibold text-base">Certainty</th>
                    <th scope="col" className="py-3 px-4 text-left whitespace-nowrap border border-blue-800 font-semibold text-base">Reasoning</th>
                    <th scope="col" className="py-3 px-4 text-left whitespace-nowrap border border-blue-800 font-semibold text-base">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 bg-gray-900">
                  {categorizedResults.map((result, index) => (
                    <tr key={index} className={index % 2 === 0 ? "bg-gray-900" : "bg-gray-850"}> {/* Zebra striping */}
                      {/* Display CaseNumber */}
                      <td className="py-2.5 px-4 align-top text-sm font-medium text-gray-300 border border-gray-700">
                        {result.originalCase.CaseNumber}
                      </td>
                      {/* Display CaseTitle */}
                      <td className="py-2.5 px-4 align-top text-sm font-medium text-gray-300 border border-gray-700">
                        {result.originalCase.CaseTitle}
                      </td>
                      {/* Display Description */}
                      <td className="py-2.5 px-4 align-top text-sm text-gray-300 border border-gray-700 max-w-xs overflow-hidden text-ellipsis">
                        {result.originalCase.Description}
                      </td>
                       {/* Display StatusReason */}
                      <td className="py-2.5 px-4 align-top text-sm text-gray-300 border border-gray-700 max-w-xs overflow-hidden text-ellipsis">
                        {result.originalCase.StatusReason}
                      </td>
                      {/* Display LLM Predicted Category */}
                      <td className={`py-2.5 px-4 align-top font-medium ${result.predictedCategory === 'Error' ? 'text-red-400' : 'text-green-400'} border border-gray-700`}>
                        {result.predictedCategory}
                      </td>
                      {/* Display LLM Predicted Resolution */}
                      <td className={`py-2.5 px-4 align-top font-medium ${result.predictedResolution === 'Error' ? 'text-red-400' : 'text-purple-400'} border border-gray-700`}>
                        {result.predictedResolution}
                      </td>
                      {/* Display Certainty */}
                      <td className="py-2.5 px-4 align-top text-sm text-gray-300 border border-gray-700">
                        {result.predictedCertainty}
                      </td>
                      {/* Display Reasoning */}
                      <td className="py-2.5 px-4 align-top text-xs text-gray-300 border border-gray-700 max-w-xs overflow-hidden text-ellipsis">
                        {result.predictedReasoning}
                      </td>
                      {/* Display Status (Success/Error) */}
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