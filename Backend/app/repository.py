"""Atomic JSON persistence for editable taxonomies."""

import json
import os
from pathlib import Path
from threading import RLock
from typing import Literal
from uuid import uuid4

from .schemas import TaxonomyItem

TaxonomyKind = Literal["categories", "resolutions"]


class JsonTaxonomyRepository:
    """Read and atomically replace the local category and resolution files."""

    def __init__(self, data_dir: Path) -> None:
        self.data_dir = data_dir
        self._lock = RLock()

    def load(self, kind: TaxonomyKind) -> list[TaxonomyItem]:
        """Load and validate one taxonomy file."""

        path = self._path(kind)
        with self._lock, path.open("r", encoding="utf-8") as file:
            raw_items = json.load(file)
        return [TaxonomyItem.model_validate(item) for item in raw_items]

    def save(self, kind: TaxonomyKind, items: list[TaxonomyItem]) -> list[TaxonomyItem]:
        """Atomically replace one taxonomy file and return the saved items."""

        path = self._path(kind)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
        payload = [item.model_dump() for item in items]

        with self._lock:
            try:
                with temporary_path.open("w", encoding="utf-8", newline="\n") as file:
                    json.dump(payload, file, indent=2, ensure_ascii=True)
                    file.write("\n")
                    file.flush()
                    os.fsync(file.fileno())
                os.replace(temporary_path, path)
            finally:
                temporary_path.unlink(missing_ok=True)
        return items

    def _path(self, kind: TaxonomyKind) -> Path:
        filename = "default_categories.json" if kind == "categories" else "default_resolutions.json"
        return self.data_dir / filename
