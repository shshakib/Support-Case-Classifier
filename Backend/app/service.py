"""Asynchronous, bounded-concurrency case classification service."""

import asyncio
import logging
from time import perf_counter

from .config import Settings
from .providers import (
    ClassificationModelFactory,
    ModelPrediction,
    PredictionParseError,
    ProviderNotConfiguredError,
)
from .schemas import CaseInput, CategorizedCase, TaxonomyItem
from .telemetry import LocalTelemetry, TelemetryEvent

logger = logging.getLogger(__name__)


class PredictionValidationError(ValueError):
    """Raised when a prediction does not use the configured taxonomy."""


class ClassificationService:
    """Classify independent cases concurrently while isolating row failures."""

    def __init__(
        self,
        factory: ClassificationModelFactory,
        telemetry: LocalTelemetry,
        settings: Settings,
    ) -> None:
        self.factory = factory
        self.telemetry = telemetry
        self.settings = settings
        self._semaphores = {
            definition.id: asyncio.Semaphore(definition.max_concurrency)
            for definition in factory.list_definitions()
        }

    async def classify_batch(
        self,
        cases: list[CaseInput],
        model_id: str,
        categories: list[TaxonomyItem],
        resolutions: list[TaxonomyItem],
        request_id: str,
    ) -> list[CategorizedCase]:
        """Classify a batch, preserving source order and recording safe telemetry."""

        if len(cases) > self.settings.max_cases_per_request:
            raise ValueError(
                f"A maximum of {self.settings.max_cases_per_request} cases is allowed per request."
            )

        definition = self.factory.get_definition(model_id)
        model = self.factory.create(model_id)
        semaphore = self._semaphores[model_id]
        started = perf_counter()

        async def classify_one(case: CaseInput) -> tuple[CategorizedCase, int, int]:
            try:
                async with semaphore:
                    async with asyncio.timeout(self.settings.model_timeout_seconds):
                        model_result = await model.predict(
                            case_number=case.case_number,
                            case_title=case.case_title,
                            description=case.description,
                            status_reason=case.status_reason,
                            categories=categories,
                            resolutions=resolutions,
                        )
                result = self._to_categorized_case(
                    case,
                    model_result,
                    categories,
                    resolutions,
                )
                return result, model_result.input_tokens, model_result.output_tokens
            except TimeoutError:
                return self._error_result(case, "The model request timed out."), 0, 0
            except Exception as error:  # Each case must fail independently.
                logger.warning(
                    "Case classification failed",
                    extra={
                        "request_id": request_id,
                        "model_id": model_id,
                        "provider": definition.provider,
                        "error_type": type(error).__name__,
                    },
                )
                return (
                    self._error_result(
                        case,
                        self._safe_error_message(error, definition.display_name),
                    ),
                    0,
                    0,
                )

        completed = await asyncio.gather(*(classify_one(case) for case in cases))
        results = [item[0] for item in completed]
        input_tokens = sum(item[1] for item in completed)
        output_tokens = sum(item[2] for item in completed)
        success_count = sum(result.error is None for result in results)
        duration_ms = round((perf_counter() - started) * 1_000)

        event = TelemetryEvent(
            request_id=request_id,
            model_id=model_id,
            provider=definition.provider,
            batch_size=len(cases),
            success_count=success_count,
            error_count=len(cases) - success_count,
            duration_ms=duration_ms,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )
        await asyncio.to_thread(self.telemetry.record, event)
        logger.info(
            "Classification batch completed",
            extra={
                "request_id": request_id,
                "model_id": model_id,
                "provider": definition.provider,
                "batch_size": len(cases),
                "success_count": success_count,
                "error_count": len(cases) - success_count,
                "duration_ms": duration_ms,
            },
        )
        return results

    def _to_categorized_case(
        self,
        case: CaseInput,
        model_result: ModelPrediction,
        categories: list[TaxonomyItem],
        resolutions: list[TaxonomyItem],
    ) -> CategorizedCase:
        prediction = model_result.prediction
        category = self._canonical_label(prediction.category, categories, "category")
        resolution = self._canonical_label(prediction.resolution, resolutions, "resolution")
        return CategorizedCase(
            original_case=case.as_original_record(),
            predicted_category=category,
            predicted_resolution=resolution,
            predicted_certainty=prediction.certainty,
            predicted_reasoning=prediction.reasoning.strip(),
        )

    @staticmethod
    def _canonical_label(
        predicted: str,
        allowed: list[TaxonomyItem],
        label_type: str,
    ) -> str:
        matches = {item.name.casefold(): item.name for item in allowed}
        canonical = matches.get(predicted.strip().casefold())
        if canonical is None:
            raise PredictionValidationError(f"The model returned an unsupported {label_type}.")
        return canonical

    @staticmethod
    def _error_result(case: CaseInput, message: str) -> CategorizedCase:
        return CategorizedCase(
            original_case=case.as_original_record(),
            predicted_category="Error",
            predicted_resolution="Error",
            predicted_certainty="unknown",
            predicted_reasoning="This case could not be classified.",
            error=message,
        )

    @staticmethod
    def _safe_error_message(error: Exception, provider_name: str) -> str:
        if isinstance(
            error,
            (PredictionParseError, PredictionValidationError, ProviderNotConfiguredError),
        ):
            return str(error)

        error_type = type(error).__name__
        if error_type in {"APIConnectionError", "ConnectError", "ConnectionError"}:
            return (
                f"Could not connect to {provider_name}. Check the backend's network "
                "access and provider endpoint."
            )
        if error_type in {"APITimeoutError", "ConnectTimeout", "ReadTimeout"}:
            return f"The request to {provider_name} timed out."
        if error_type in {"AuthenticationError", "Unauthenticated"}:
            return f"{provider_name} rejected the configured API key."
        if error_type in {"PermissionDeniedError", "PermissionDenied"}:
            return f"The configured account cannot use this {provider_name} model."
        if error_type in {"RateLimitError", "ResourceExhausted"}:
            return f"{provider_name} rate limit or quota was reached."
        if error_type in {"NotFoundError", "ModelNotFoundError"}:
            return f"The configured {provider_name} model is not available."
        return "The model provider could not classify this case."
