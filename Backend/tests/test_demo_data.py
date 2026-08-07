import csv
import json
from datetime import date
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

EXPECTED_LABELS = {
    "CS-2024-001": ("Technical Support", "Workaround Provided"),
    "CS-2024-002": ("Technical Support", "Resolved"),
    "CS-2024-003": ("Technical Support", "Escalated"),
    "CS-2024-004": ("Account Management", "Resolved"),
    "CS-2024-005": ("Billing Inquiry", "Resolved"),
    "CS-2024-006": ("Product Feature Request", "Escalated"),
    "CS-2024-007": ("Technical Support", "Duplicate Case"),
    "CS-2024-008": ("Technical Support", "Resolved"),
    "CS-2024-009": ("General Inquiry", "Information Provided"),
    "CS-2024-010": ("Account Management", "No Action Required"),
}


def load_taxonomy(filename: str) -> set[str]:
    items = json.loads((DATA_DIR / filename).read_text(encoding="utf-8"))
    return {item["name"] for item in items}


def test_sample_cases_are_complete_and_well_formed():
    with (DATA_DIR / "Sample.csv").open(encoding="utf-8", newline="") as file:
        rows = list(csv.DictReader(file))

    assert len(rows) == 10
    assert {row["CaseNumber"] for row in rows} == set(EXPECTED_LABELS)
    assert all(all(value.strip() for value in row.values()) for row in rows)
    assert all(row["Priority"] in {"Low", "Medium", "High"} for row in rows)
    assert all(date.fromisoformat(row["DateOpened"]) for row in rows)


def test_demo_exercises_every_default_taxonomy_label():
    category_names = load_taxonomy("default_categories.json")
    resolution_names = load_taxonomy("default_resolutions.json")
    expected_categories = {category for category, _ in EXPECTED_LABELS.values()}
    expected_resolutions = {resolution for _, resolution in EXPECTED_LABELS.values()}

    assert expected_categories == category_names
    assert expected_resolutions == resolution_names
