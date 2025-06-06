import os
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError
from dotenv import load_dotenv
from typing import List, Dict, Any, Optional

# --- LangChain Imports ---
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.chat_models import ChatOllama
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.runnables import RunnablePassthrough
# --- End LangChain Imports ---

load_dotenv()

app = FastAPI()

# Configure CORS
origins = [
    "http://localhost:5173",  # React frontend
    "http://127.0.0.1:5173",  # React frontend
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Models ---
class Category(BaseModel):
    name: str
    description: str

class Case(BaseModel):
    CaseNumber: str = Field(alias="CaseNumber")
    CaseTitle: str = Field(alias="CaseTitle")
    Description: str = Field(alias="Description")
    StatusReason: str = Field(alias="StatusReason")
    extra_fields: dict = Field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict):
        known_fields = {"CaseNumber", "CaseTitle", "Description", "StatusReason"}
        instance_data = {k: v for k, v in data.items() if k in known_fields}
        extra_fields = {k: v for k, v in data.items() if k not in known_fields}
        return cls(**instance_data, extra_fields=extra_fields)

class CategorizedCase(BaseModel):
    originalCase: Dict[str, Any]
    predictedCategory: str
    predictedResolution: str
    predictedCertainty: str
    predictedReasoning: str
    error: Optional[str] = None

# --- LLM Setup ---
def get_llm(model_name: str):
    if model_name == "openai":
        return ChatOpenAI(model="gpt-4o-mini", temperature=0)
    elif model_name == "gemini":
        return ChatGoogleGenerativeAI(model="gemini-pro", temperature=0)
    elif model_name == "ollama":
        return ChatOllama(model="llama3", temperature=0)
    else:
        raise ValueError(f"Unsupported model: {model_name}")

# --- Data Loading and Saving Functions ---
def load_data_from_json(file_path: str) -> List[Dict[str, Any]]:
    """Loads data from a JSON file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Error: File not found at {file_path}")
        raise HTTPException(status_code=500, detail=f"Required data file not found: {file_path}")
    except json.JSONDecodeError:
        print(f"Error: Could not decode JSON from {file_path}")
        raise HTTPException(status_code=500, detail=f"Error reading JSON from file: {file_path}")
    except Exception as e:
        print(f"An unexpected error occurred loading {file_path}: {e}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")

def save_data_to_json(file_path: str, data: List[Dict[str, Any]]):
    """Saves a list of dictionaries to a JSON file."""
    try:
        # Ensure the directory exists
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2) # Use indent for pretty printing
    except Exception as e:
        print(f"Error: Could not save data to {file_path}: {e}")
        raise HTTPException(status_code=500, detail=f"Error saving data to file: {e}")


# --- Prompt Template ---
PROMPT_TEMPLATE = """
You are an AI assistant specialized in categorizing and resolving customer service cases.
Your task is to analyze the provided case details and classify it into one of the given product categories and determine its resolution type.

Here are the details for the case:
Case Number: {case_number}
Case Title: {case_title}
Case Description: {description}
Status Reason: {status_reason}

Product Categories: {product_categories_json}
Resolution Types: {resolution_types_json}

Based on the "Case Title" and 'Case Description' and 'Status Reason' for resolution, determine the most fitting single category and resolution type.
Also, provide a certainty level for your prediction (high, medium, or low) and a brief reasoning for your choices.

The output MUST be a JSON object with the following keys:
{{
    "category": "Predicted Category Name (from Product Categories)",
    "resolution": "Predicted Resolution Type (from Resolution Types)",
    "certainty": "high | medium | low",
    "reasoning": "Brief explanation for the categorization and resolution, explicitly referencing Case Title, Description, and Status Reason."
}}
Make sure 'category' and 'resolution' directly match one of the provided names in their respective lists.
"""

# --- Routes ---
@app.get("/categories")
async def get_categories():
    categories_path = os.path.join(os.path.dirname(__file__), "data", "default_categories.json")
    return load_data_from_json(categories_path)

@app.post("/categories")
async def update_categories(new_categories: List[Category]):
    """Receives a list of categories and saves them to default_categories.json."""
    categories_path = os.path.join(os.path.dirname(__file__), "data", "default_categories.json")
    
    # Convert Pydantic models to dictionaries for JSON serialization
    data_to_save = [cat.model_dump() for cat in new_categories]
    
    save_data_to_json(categories_path, data_to_save)
    return {"message": "Categories updated successfully", "categories": new_categories}

@app.get("/resolutions")
async def get_resolutions():
    resolutions_path = os.path.join(os.path.dirname(__file__), "data", "default_resolutions.json")
    return load_data_from_json(resolutions_path)

@app.post("/resolutions")
async def update_resolutions(new_resolutions: List[Category]):
    """Receives a list of resolutions and saves them to default_resolutions.json."""
    resolutions_path = os.path.join(os.path.dirname(__file__), "data", "default_resolutions.json")
    
    # Convert Pydantic models to dictionaries for JSON serialization
    data_to_save = [res.model_dump() for res in new_resolutions]
    
    save_data_to_json(resolutions_path, data_to_save)
    return {"message": "Resolutions updated successfully", "resolutions": new_resolutions}


@app.post("/categorize")
async def categorize_cases(cases: List[Dict[str, Any]], model_name: str = "openai"):
    categorized_results: List[CategorizedCase] = []
    current_llm = get_llm(model_name)
    parser = JsonOutputParser()
    prompt = PromptTemplate(
        template=PROMPT_TEMPLATE,
        input_variables=["case_number", "case_title", "description", "status_reason", "product_categories_json", "resolution_types_json"],
        partial_variables={},
    )

    try:
        categories = await get_categories()
        resolutions = await get_resolutions()

        cases_for_processing: List[Case] = []
        for case_data in cases:
            try:
                cases_for_processing.append(Case.from_dict(case_data))
            except ValidationError as e:
                categorized_results.append(CategorizedCase(
                    originalCase=case_data,
                    predictedCategory="Error",
                    predictedResolution="Error",
                    predictedCertainty="Error",
                    predictedReasoning=f"Missing required fields for processing: {e}",
                    error=f"Validation Error: {e}"
                ))

        if not cases_for_processing:
            return categorized_results

        chain = (
            {
                "case_number": RunnablePassthrough(),
                "case_title": RunnablePassthrough(),
                "description": RunnablePassthrough(),
                "status_reason": RunnablePassthrough(),
                "product_categories_json": lambda x: json.dumps([c['name'] for c in categories]),
                "resolution_types_json": lambda x: json.dumps([r['name'] for r in resolutions]),
            }
            | prompt
            | current_llm
            | parser
        )

        batch_inputs = [
            {
                "case_number": case.CaseNumber,
                "case_title": case.CaseTitle,
                "description": case.Description,
                "status_reason": case.StatusReason,
            }
            for case in cases_for_processing
        ]

        batch_llm_outputs = chain.batch(batch_inputs)

        for i, result_dict in enumerate(batch_llm_outputs):
            original_case = cases_for_processing[i]

            categorized_results.append(CategorizedCase(
                originalCase={**original_case.model_dump(by_alias=True), **original_case.extra_fields},
                predictedCategory=result_dict.get("category", "Uncategorized"),
                predictedResolution=result_dict.get("resolution", "Unresolved"),
                predictedCertainty=result_dict.get("certainty", "unknown"),
                predictedReasoning=result_dict.get("reasoning", "No reasoning provided."),
            ))
    except Exception as e:
        print(f"Error during batch categorization: {e}")
        for case_item in cases_for_processing:
            categorized_results.append(CategorizedCase(
                originalCase={**case_item.model_dump(by_alias=True), **case_item.extra_fields},
                predictedCategory="Error",
                predictedResolution="Error",
                predictedCertainty="Error",
                predictedReasoning="Error during processing.",
                error=str(e),
            ))

    return categorized_results