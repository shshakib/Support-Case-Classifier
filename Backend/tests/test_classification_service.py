import asyncio

import pytest

from app.config import Settings
from app.providers import ModelDefinition, ModelPrediction
from app.schemas import CaseInput, ClassificationPrediction, TaxonomyItem
from app.service import ClassificationService
from app.telemetry import LocalTelemetry


class FakeModel:
    def __init__(self) -> None:
        self.active = 0
        self.max_active = 0

    async def predict(self, case_number: str, case_title: str, **_: object) -> ModelPrediction:
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        await asyncio.sleep(0.01 if case_number != "2" else 0.03)
        self.active -= 1
        if case_title == "Fail":
            raise RuntimeError("sensitive provider details")
        return ModelPrediction(
            prediction=ClassificationPrediction(
                category="Technical Support",
                resolution="Resolved",
                certainty="high",
                reasoning="The described technical issue was resolved.",
            ),
            input_tokens=10,
            output_tokens=5,
        )


class FakeFactory:
    def __init__(self, model: FakeModel) -> None:
        self.model = model
        self.definition = ModelDefinition(
            id="fake",
            provider="fake",
            display_name="Fake",
            model_name="fake-v1",
            configured=True,
            local=True,
            max_concurrency=2,
        )

    def list_definitions(self) -> list[ModelDefinition]:
        return [self.definition]

    def get_definition(self, model_id: str) -> ModelDefinition:
        assert model_id == "fake"
        return self.definition

    def create(self, model_id: str) -> FakeModel:
        assert model_id == "fake"
        return self.model


@pytest.mark.asyncio
async def test_batch_preserves_order_limits_concurrency_and_isolates_errors(tmp_path):
    model = FakeModel()
    telemetry = LocalTelemetry(tmp_path / "telemetry.jsonl")
    settings = Settings(
        _env_file=None,
        log_dir=tmp_path,
        data_dir=tmp_path,
        model_timeout_seconds=5,
    )
    service = ClassificationService(FakeFactory(model), telemetry, settings)
    cases = [
        CaseInput.model_validate(
            {
                "CaseNumber": str(index),
                "CaseTitle": "Fail" if index == 2 else f"Case {index}",
                "Description": "Description",
                "StatusReason": "Resolved",
            }
        )
        for index in range(1, 5)
    ]
    categories = [TaxonomyItem(name="Technical Support", description="Technical issues")]
    resolutions = [TaxonomyItem(name="Resolved", description="Issue is closed")]

    results = await service.classify_batch(
        cases,
        "fake",
        categories,
        resolutions,
        request_id="request-1",
    )

    assert [result.original_case["CaseNumber"] for result in results] == ["1", "2", "3", "4"]
    assert results[1].error == "The model provider could not classify this case."
    assert all(result.error is None for result in (results[0], results[2], results[3]))
    assert model.max_active == 2

    summary = telemetry.summary()
    assert summary["totalCases"] == 4
    assert summary["successCount"] == 3
    assert summary["errorCount"] == 1
    assert "Description" not in telemetry.path.read_text(encoding="utf-8")


@pytest.mark.parametrize(
    ("error_type", "expected"),
    [
        (
            "APIConnectionError",
            "Could not connect to OpenAI. Check the backend's network access "
            "and provider endpoint.",
        ),
        ("AuthenticationError", "OpenAI rejected the configured API key."),
        ("RateLimitError", "OpenAI rate limit or quota was reached."),
    ],
)
def test_provider_errors_use_safe_actionable_messages(error_type, expected):
    provider_error = type(error_type, (Exception,), {})()

    assert ClassificationService._safe_error_message(provider_error, "OpenAI") == expected


def test_unknown_provider_error_does_not_expose_details():
    provider_error = RuntimeError("sensitive provider details")

    assert (
        ClassificationService._safe_error_message(provider_error, "OpenAI")
        == "The model provider could not classify this case."
    )
