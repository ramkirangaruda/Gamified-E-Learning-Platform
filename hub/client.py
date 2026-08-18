"""Thin POST /api/program client. Emits the existing envelope unchanged -- see
internal/api/api.go's programRequestWrapper: {"ast": <AST envelope>, "client_problems":
[...]}. Adds nothing to the AST contract; this is the only network call hub/ makes.
"""
from __future__ import annotations

from typing import Any

import requests

DEFAULT_API_BASE = "http://localhost:8080"
DEFAULT_TIMEOUT_S = 10


def post_program(
    ast_envelope: dict[str, Any],
    level_id: str | None = None,
    client_problems: list[str] | None = None,
    api_base: str = DEFAULT_API_BASE,
    timeout: float = DEFAULT_TIMEOUT_S,
) -> requests.Response:
    params = {"level_id": level_id} if level_id else {}
    body = {"ast": ast_envelope, "client_problems": client_problems or []}
    return requests.post(f"{api_base}/api/program", params=params, json=body, timeout=timeout)
