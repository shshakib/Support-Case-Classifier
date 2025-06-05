import os
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError
from dotenv import load_dotenv

# --- LangChain Imports ---
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.chat_models import ChatOllama
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableParallel, RunnablePassthrough
from typing import List, Dict, Any, Optional

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
    Title: str = Field(alias="Title")
    Description: str = Field(alias="Description")
    # Allow other fields from CSV to be passed through
    # We use a dict to capture arbitrary extra fields from the CSV
    extra_fields: dict = Field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict):
        # Manually extract known fields and pass remaining as extra_fields
        known_fields = {"Title", "Description"} # Add other fixed fields if they exist
        instance_data = {k: v for k, v in data.items() if k in known_fields}
        extra_fields = {k: v for k, v in data.items() if k not in known_fields}
        return cls(**instance_data, extra_fields=extra_fields)

# Request body model for the categorization endpoint
class CategorizationRequest(BaseModel):
    cases: List[Dict[str, Any]]  # Raw dictionaries from CSV before Pydantic Case model
    availableCategories: List[Category]
    availableResolutions: List[Category]
    selectedModel: str

# Response model for a single categorized case
class CategorizedCase(BaseModel):
    originalCase: Dict[str, Any] # Use Dict[str, Any] to accommodate flattened fields
    predictedCategory: str
    predictedResolution: str
    predictedCertainty: str
    predictedReasoning: str
    error: Optional[str] = None # Added for error handling

# --- In-memory storage for categories and resolutions (for demonstration) ---
# In a real application, these would be loaded from a database or configuration.
product_categories_db: List[Category] = [
    Category(name="Technical Support", description="Issues requiring technical assistance, troubleshooting, or bug reports."),
    Category(name="Billing/Accounts", description="Questions or problems related to invoices, payments, subscriptions, or account management."),
    Category(name="Feature Request", description="Suggestions for new features or enhancements to existing ones."),
    Category(name="General Inquiry", description="Questions or feedback not fitting into other categories."),
]

resolution_types_db: List[Category] = [
    Category(name="Resolved - Provided Solution", description="The customer's issue was resolved by providing a specific solution or workaround."),
    Category(name="Resolved - Bug Fix", description="The issue was a confirmed bug that has been fixed in a new release or patch."),
    Category(name="Resolved - Information Provided", description="The customer's question was answered by providing relevant information or documentation."),
    Category(name="Unresolved - Escalated", description="The issue could not be resolved by the first line of support and was escalated to a specialized team."),
    Category(name="Unresolved - Requires More Info", description="The customer did not provide enough information to resolve the issue."),
    Category(name="Duplicate", description="The case is a duplicate of an existing case."),
]

# --- LLM Chain Setup ---
def get_llm_chain(model_name: str):
    if model_name == 'ollama':
        # Assumes Ollama server is running locally and 'llama3' model is pulled
        llm = ChatOllama(model="llama3", temperature=0) # Set temperature to 0 for consistent JSON output
    elif model_name == 'gemini':
        # For Gemini, ensure GOOGLE_API_KEY is set in your .env
        llm = ChatGoogleGenerativeAI(model="gemini-pro", temperature=0)
    elif model_name == 'openai':
        # For OpenAI, ensure OPENAI_API_KEY is set in your .env
        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0) # Using a smaller, faster model for general use
    else:
        raise ValueError(f"Unsupported model: {model_name}")

    # The prompt should clearly ask for JSON output matching the expected structure
    prompt_template = PromptTemplate(
        template="""You are an AI assistant designed to categorize and provide resolutions for customer support cases.
        Based on the provided case details, available categories, and available resolution types, categorize the case and suggest a resolution.
        You must output your answer in JSON format with the following keys: "category", "resolution", "certainty", and "reasoning".

        Strictly adhere to the following JSON format:
        ```json
        {{
            "category": "string",
            "resolution": "string",
            "certainty": "string (e.g., 'High', 'Medium', 'Low')",
            "reasoning": "string (brief explanation for categorization and resolution)"
        }}
        ```
        The "category" and "resolution" MUST EXACTLY match one of the provided available names.
        If no category or resolution fits well, you may suggest the closest one or indicate "Uncategorized" or "Unresolved".

        Available Categories:
        {available_categories}

        Available Resolution Types:
        {available_resolutions}

        Customer Case Details:
        Title: {case_title}
        Description: {case_description}

        Your JSON response:
        """,
        input_variables=["case_title", "case_description", "available_categories", "available_resolutions"],
    )

    output_parser = JsonOutputParser()

    # Create the chain: Prompt -> LLM -> Output Parser
    llm_chain = prompt_template | llm | output_parser
    return llm_chain

# --- API Endpoints ---
@app.get("/")
async def read_root():
    return {"message": "Welcome to the Case Categorization API"}

@app.get("/categories", response_model=List[Category])
async def get_categories():
    return product_categories_db

@app.post("/categories", response_model=List[Category])
async def update_categories(categories: List[Category]):
    global product_categories_db
    product_categories_db = categories
    return product_categories_db

@app.get("/resolutions", response_model=List[Category])
async def get_resolutions():
    return resolution_types_db

@app.post("/resolutions", response_model=List[Category])
async def update_resolutions(resolutions: List[Category]):
    global resolution_types_db
    resolution_types_db = resolutions
    return resolution_types_db

@app.post("/categorize-cases", response_model=List[CategorizedCase])
async def categorize_cases(request: CategorizationRequest):
    categorized_results: List[CategorizedCase] = []
    cases_for_processing: List[Case] = []

    # Parse raw dictionaries from frontend into Pydantic Case models
    for raw_case_data in request.cases:
        try:
            case_instance = Case.from_dict(raw_case_data)
            cases_for_processing.append(case_instance)
        except ValidationError as e:
            # If a single case fails Pydantic validation, add an error entry for it
            print(f"Validation error for a raw case: {raw_case_data} - {e.errors()}")
            # Create a placeholder Case instance to hold the original data for error reporting
            error_case_placeholder = Case(Title=raw_case_data.get('Title', 'N/A'), Description=raw_case_data.get('Description', 'N/A'))
            # Populate extra_fields with everything if it failed initial parsing
            error_case_placeholder.extra_fields = {k: v for k, v in raw_case_data.items() if k not in ["Title", "Description"]}

            categorized_results.append(CategorizedCase(
                originalCase={**error_case_placeholder.model_dump(by_alias=True), **error_case_placeholder.extra_fields},
                predictedCategory="Error",
                predictedResolution="Error",
                predictedCertainty="N/A",
                predictedReasoning=f"Failed to parse case data: {e.errors()[0].get('msg', 'Unknown validation error')}",
                error=f"Validation failed for case: {e.errors()[0].get('loc', ['Unknown Field'])[0]} - {e.errors()[0].get('msg', 'Unknown error')}"
            ))
            continue # Skip to the next case if parsing failed

    # Format categories and resolutions for the prompt
    available_categories_str = json.dumps([c.model_dump() for c in request.availableCategories])
    available_resolutions_str = json.dumps([r.model_dump() for r in request.availableResolutions])

    # Get the appropriate LLM chain based on selected model
    llm_chain = get_llm_chain(request.selectedModel)

    # Prepare batch inputs for LLM
    batch_inputs = [
        {
            "case_title": case_item.Title,
            "case_description": case_item.Description,
            "available_categories": available_categories_str,
            "available_resolutions": available_resolutions_str,
        }
        for case_item in cases_for_processing
    ]

    try:
        # Batch invoke the LLM chain
        # The invoke method might return results in a list directly
        batch_llm_outputs = llm_chain.batch(batch_inputs) # Assumes batch is synchronous or handles await internally

        for i, result_dict in enumerate(batch_llm_outputs):
            original_case = cases_for_processing[i] # Use the enriched Case object

            # Ensure the result_dict has the expected keys, provide fallbacks
            categorized_results.append(CategorizedCase(
                originalCase={**original_case.model_dump(by_alias=True), **original_case.extra_fields}, # Include extra fields here
                predictedCategory=result_dict.get("category", "Uncategorized"),
                predictedResolution=result_dict.get("resolution", "Unresolved"),
                predictedCertainty=result_dict.get("certainty", "unknown"),
                predictedReasoning=result_dict.get("reasoning", "No reasoning provided."), # New reasoning field
            ))
    except Exception as e:
        print(f"Error during batch categorization: {e}")
        # If the whole batch fails, mark all cases as error
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