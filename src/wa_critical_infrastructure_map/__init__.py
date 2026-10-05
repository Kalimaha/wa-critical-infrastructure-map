"""WA critical infrastructure map package."""

from __future__ import annotations

__all__ = ["main"]


def main() -> None:
    """Entry point for the project CLI.

    This repository is primarily a frontend app, but the Python package metadata
    needs to exist so `uv run` and `uv sync` can resolve the project correctly.
    """
    print("wa-critical-infrastructure-map is ready.")
