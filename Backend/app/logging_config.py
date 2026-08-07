"""Local logging configuration with sensitive-data-safe structured files."""

import json
import logging
from datetime import UTC, datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path

SAFE_RECORD_FIELDS = (
    "request_id",
    "method",
    "path",
    "status_code",
    "duration_ms",
    "model_id",
    "provider",
    "batch_size",
    "success_count",
    "error_count",
    "error_type",
)

_LOGGING_CONFIGURED = False


class SafeJsonFormatter(logging.Formatter):
    """Serialize only explicitly approved metadata to the local log file."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for field in SAFE_RECORD_FIELDS:
            if hasattr(record, field):
                payload[field] = getattr(record, field)
        if record.exc_info:
            payload["error_type"] = record.exc_info[0].__name__
        return json.dumps(payload, ensure_ascii=True)


def configure_logging(log_dir: Path, level_name: str = "INFO") -> None:
    """Configure console and rotating local-file logging once per process."""

    global _LOGGING_CONFIGURED
    root_logger = logging.getLogger()
    if _LOGGING_CONFIGURED:
        return

    log_dir.mkdir(parents=True, exist_ok=True)
    level = getattr(logging, level_name.upper(), logging.INFO)
    root_logger.setLevel(level)

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))

    file_handler = RotatingFileHandler(
        log_dir / "app.log",
        maxBytes=5_000_000,
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setFormatter(SafeJsonFormatter())

    root_logger.handlers.clear()
    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)
    _LOGGING_CONFIGURED = True
