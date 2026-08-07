import json

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def create_test_client(tmp_path) -> TestClient:
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / "default_categories.json").write_text(
        json.dumps([{"name": "Technical Support", "description": "Technical issues"}]),
        encoding="utf-8",
    )
    (data_dir / "default_resolutions.json").write_text(
        json.dumps([{"name": "Resolved", "description": "Issue is closed"}]),
        encoding="utf-8",
    )
    settings = Settings(
        _env_file=None,
        data_dir=data_dir,
        log_dir=tmp_path / "logs",
        openai_api_key=None,
        google_api_key=None,
    )
    return TestClient(create_app(settings))


def test_health_models_and_taxonomy_round_trip(tmp_path):
    with create_test_client(tmp_path) as client:
        health = client.get("/api/health")
        assert health.status_code == 200
        assert health.json()["status"] == "ok"

        models = client.get("/api/models").json()
        assert [model["id"] for model in models] == ["openai", "gemini", "ollama"]
        assert models[0]["configured"] is False

        categories = [
            {"name": "Billing", "description": "Invoices and payment questions"},
            {"name": "Technical", "description": "Product defects and failures"},
        ]
        saved = client.post("/api/taxonomy/categories", json=categories)
        assert saved.status_code == 200
        assert client.get("/api/taxonomy/categories").json() == categories


def test_duplicate_taxonomy_names_are_rejected(tmp_path):
    with create_test_client(tmp_path) as client:
        response = client.post(
            "/api/taxonomy/categories",
            json=[
                {"name": "Billing", "description": "One"},
                {"name": "billing", "description": "Two"},
            ],
        )
        assert response.status_code == 422
        assert response.json()["detail"] == "Taxonomy names must be unique."


def test_unconfigured_provider_returns_clear_error(tmp_path):
    with create_test_client(tmp_path) as client:
        response = client.post(
            "/api/categorize",
            json={
                "modelId": "openai",
                "cases": [
                    {
                        "CaseNumber": "1",
                        "CaseTitle": "Printer failure",
                        "Description": "Printer is offline",
                        "StatusReason": "Pending",
                    }
                ],
            },
        )
        assert response.status_code == 409
        assert "not configured" in response.json()["detail"]
