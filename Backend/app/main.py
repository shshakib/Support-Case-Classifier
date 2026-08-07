"""FastAPI application factory and HTTP routes."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import Response

from .config import Settings, get_settings
from .logging_config import configure_logging
from .providers import ModelFactory, ProviderNotConfiguredError, UnsupportedModelError
from .repository import JsonTaxonomyRepository, TaxonomyKind
from .schemas import (
    CategorizationRequest,
    CategorizedCase,
    HealthResponse,
    ModelInfo,
    TaxonomyItem,
)
from .service import ClassificationService
from .telemetry import LocalTelemetry

logger = logging.getLogger(__name__)


def _validate_taxonomy(items: list[TaxonomyItem]) -> None:
    if not items:
        raise HTTPException(status_code=422, detail="At least one item is required.")
    normalized_names = [item.name.casefold() for item in items]
    if len(normalized_names) != len(set(normalized_names)):
        raise HTTPException(status_code=422, detail="Taxonomy names must be unique.")


def create_app(
    settings: Settings | None = None,
    repository: JsonTaxonomyRepository | None = None,
    model_factory: ModelFactory | None = None,
    telemetry: LocalTelemetry | None = None,
    classifier: ClassificationService | None = None,
) -> FastAPI:
    """Create an application with injectable services for reliable tests."""

    runtime_settings = settings or get_settings()
    configure_logging(runtime_settings.log_dir, runtime_settings.log_level)
    taxonomy_repository = repository or JsonTaxonomyRepository(runtime_settings.data_dir)
    factory = model_factory or ModelFactory(runtime_settings)
    local_telemetry = telemetry or LocalTelemetry(runtime_settings.log_dir / "telemetry.jsonl")
    classification_service = classifier or ClassificationService(
        factory,
        local_telemetry,
        runtime_settings,
    )

    api = FastAPI(title=runtime_settings.app_name, version="1.0.0")
    api.state.settings = runtime_settings
    api.state.repository = taxonomy_repository
    api.state.model_factory = factory
    api.state.telemetry = local_telemetry
    api.state.classifier = classification_service

    api.add_middleware(
        CORSMiddleware,
        allow_origins=runtime_settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )

    @api.middleware("http")
    async def request_logging(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        request_id = request.headers.get("X-Request-ID") or uuid4().hex
        request.state.request_id = request_id
        started = perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Request-ID"] = request_id
            return response
        finally:
            logger.info(
                "HTTP request completed",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": status_code,
                    "duration_ms": round((perf_counter() - started) * 1_000),
                },
            )

    prefix = runtime_settings.api_prefix.rstrip("/")

    @api.get(f"{prefix}/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(environment=runtime_settings.environment)

    @api.get(f"{prefix}/models", response_model=list[ModelInfo])
    async def models() -> list[ModelInfo]:
        return [definition.as_info() for definition in factory.list_definitions()]

    async def load_taxonomy(kind: TaxonomyKind) -> list[TaxonomyItem]:
        try:
            return await asyncio.to_thread(taxonomy_repository.load, kind)
        except (OSError, ValueError) as error:
            logger.error("Taxonomy could not be loaded", extra={"error_type": type(error).__name__})
            raise HTTPException(
                status_code=500,
                detail="Taxonomy data could not be loaded.",
            ) from error

    async def save_taxonomy(
        kind: TaxonomyKind,
        items: list[TaxonomyItem],
    ) -> list[TaxonomyItem]:
        _validate_taxonomy(items)
        try:
            return await asyncio.to_thread(taxonomy_repository.save, kind, items)
        except OSError as error:
            logger.error("Taxonomy could not be saved", extra={"error_type": type(error).__name__})
            raise HTTPException(
                status_code=500,
                detail="Taxonomy data could not be saved.",
            ) from error

    @api.get(f"{prefix}/taxonomy/categories", response_model=list[TaxonomyItem])
    async def get_categories() -> list[TaxonomyItem]:
        return await load_taxonomy("categories")

    @api.post(f"{prefix}/taxonomy/categories", response_model=list[TaxonomyItem])
    async def update_categories(items: list[TaxonomyItem]) -> list[TaxonomyItem]:
        return await save_taxonomy("categories", items)

    @api.get(f"{prefix}/taxonomy/resolutions", response_model=list[TaxonomyItem])
    async def get_resolutions() -> list[TaxonomyItem]:
        return await load_taxonomy("resolutions")

    @api.post(f"{prefix}/taxonomy/resolutions", response_model=list[TaxonomyItem])
    async def update_resolutions(items: list[TaxonomyItem]) -> list[TaxonomyItem]:
        return await save_taxonomy("resolutions", items)

    @api.post(f"{prefix}/categorize", response_model=list[CategorizedCase])
    async def categorize(
        payload: CategorizationRequest,
        request: Request,
    ) -> list[CategorizedCase]:
        try:
            categories, resolutions = await asyncio.gather(
                load_taxonomy("categories"),
                load_taxonomy("resolutions"),
            )
            return await classification_service.classify_batch(
                cases=payload.cases,
                model_id=payload.model_id,
                categories=categories,
                resolutions=resolutions,
                request_id=request.state.request_id,
            )
        except UnsupportedModelError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        except ProviderNotConfiguredError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    @api.get(f"{prefix}/telemetry/summary")
    async def telemetry_summary() -> dict[str, object]:
        return await asyncio.to_thread(local_telemetry.summary)

    return api


app = create_app()
