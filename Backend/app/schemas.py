"""Validated API and domain schemas."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


def to_camel(value: str) -> str:
    """Convert a snake_case field name to lower camelCase."""

    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class ApiModel(BaseModel):
    """Base model that serializes API fields as lower camelCase."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class TaxonomyItem(BaseModel):
    """A permitted classification category or resolution."""

    name: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=1_000)

    @field_validator("name", "description", mode="before")
    @classmethod
    def strip_text(cls, value: Any) -> Any:
        """Normalize user-edited taxonomy text before validation."""

        return value.strip() if isinstance(value, str) else value


class CaseInput(BaseModel):
    """A support case with required fields and preserved extra CSV columns."""

    model_config = ConfigDict(extra="allow", populate_by_name=True, str_strip_whitespace=True)

    case_number: str = Field(alias="CaseNumber", min_length=1, max_length=200)
    case_title: str = Field(alias="CaseTitle", min_length=1, max_length=1_000)
    description: str = Field(alias="Description", min_length=1, max_length=20_000)
    status_reason: str = Field(alias="StatusReason", min_length=1, max_length=5_000)

    def as_original_record(self) -> dict[str, Any]:
        """Return the case with source CSV names and all additional columns."""

        return self.model_dump(by_alias=True)


class CategorizationRequest(ApiModel):
    """Batch classification request."""

    model_id: str = Field(min_length=1, max_length=80)
    cases: list[CaseInput] = Field(min_length=1)


class ClassificationPrediction(BaseModel):
    """Structured output required from every model provider."""

    category: str = Field(min_length=1, max_length=120)
    resolution: str = Field(min_length=1, max_length=120)
    certainty: Literal["high", "medium", "low"]
    reasoning: str = Field(min_length=1, max_length=2_000)


class CategorizedCase(ApiModel):
    """One classified case or a row-level processing error."""

    original_case: dict[str, Any]
    predicted_category: str
    predicted_resolution: str
    predicted_certainty: str
    predicted_reasoning: str
    error: str | None = None


class ModelInfo(ApiModel):
    """Non-sensitive model configuration exposed to the frontend."""

    id: str
    provider: str
    display_name: str
    model_name: str
    configured: bool
    local: bool = False
    max_concurrency: int


class HealthResponse(ApiModel):
    """API health response."""

    status: Literal["ok"] = "ok"
    environment: str
