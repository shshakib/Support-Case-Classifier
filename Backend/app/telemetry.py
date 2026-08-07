"""Aggregate, local-only classification telemetry."""

import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock
from typing import Any


@dataclass(frozen=True, slots=True)
class TelemetryEvent:
    """A sanitized summary of one classification batch."""

    request_id: str
    model_id: str
    provider: str
    batch_size: int
    success_count: int
    error_count: int
    duration_ms: int
    input_tokens: int = 0
    output_tokens: int = 0
    timestamp: str = ""

    def to_record(self) -> dict[str, Any]:
        """Return a JSON-safe record with a UTC timestamp."""

        record = asdict(self)
        record["timestamp"] = self.timestamp or datetime.now(UTC).isoformat()
        return record


class LocalTelemetry:
    """Append sanitized events to JSONL and produce aggregate summaries."""

    def __init__(self, path: Path, max_bytes: int = 5_000_000) -> None:
        self.path = path
        self.max_bytes = max_bytes
        self._lock = Lock()

    def record(self, event: TelemetryEvent) -> None:
        """Persist a single batch event without case content or identifiers."""

        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            if self.path.exists() and self.path.stat().st_size >= self.max_bytes:
                archive_path = self.path.with_suffix(".1.jsonl")
                archive_path.unlink(missing_ok=True)
                self.path.replace(archive_path)
            with self.path.open("a", encoding="utf-8") as file:
                file.write(json.dumps(event.to_record(), ensure_ascii=True) + "\n")

    def summary(self) -> dict[str, Any]:
        """Aggregate all valid events currently retained on disk."""

        totals: dict[str, Any] = {
            "totalBatches": 0,
            "totalCases": 0,
            "successCount": 0,
            "errorCount": 0,
            "inputTokens": 0,
            "outputTokens": 0,
            "averageBatchDurationMs": 0,
            "models": {},
        }
        duration_total = 0

        with self._lock:
            paths = [self.path.with_suffix(".1.jsonl"), self.path]
            for path in paths:
                if not path.exists():
                    continue
                for line in path.read_text(encoding="utf-8").splitlines():
                    try:
                        event = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    totals["totalBatches"] += 1
                    totals["totalCases"] += int(event.get("batch_size", 0))
                    totals["successCount"] += int(event.get("success_count", 0))
                    totals["errorCount"] += int(event.get("error_count", 0))
                    totals["inputTokens"] += int(event.get("input_tokens", 0))
                    totals["outputTokens"] += int(event.get("output_tokens", 0))
                    duration_total += int(event.get("duration_ms", 0))

                    model_id = str(event.get("model_id", "unknown"))
                    model_totals = totals["models"].setdefault(
                        model_id,
                        {"batches": 0, "cases": 0, "errors": 0},
                    )
                    model_totals["batches"] += 1
                    model_totals["cases"] += int(event.get("batch_size", 0))
                    model_totals["errors"] += int(event.get("error_count", 0))

        if totals["totalBatches"]:
            totals["averageBatchDurationMs"] = round(duration_total / totals["totalBatches"])
        return totals
