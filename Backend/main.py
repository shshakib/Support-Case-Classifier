"""Compatibility entry point for ``uvicorn main:app``.

The application implementation lives in :mod:`app.main` so the API can be
tested and composed without keeping all behavior in one module.
"""

try:
    from .app.main import app, create_app
except ImportError:  # Running from the Backend directory.
    from app.main import app, create_app

__all__ = ["app", "create_app"]
