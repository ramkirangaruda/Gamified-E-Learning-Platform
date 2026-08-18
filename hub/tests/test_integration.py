"""Acceptance #2 (HANDOFF-hub-mode.md): the AST this pipeline produces posts to the real
/api/program and solves an actual level, end to end against the real Go server -- not
mocked.

Skips (doesn't fail) if `go` isn't on PATH. This repo was set up on a machine without the
Go toolchain installed (see QUESTIONS.md); this test is written to run for real the
moment it's run somewhere Go is available, rather than faked out with a mocked HTTP
response, but it can't be exercised in the environment this branch was authored in.
Someone with `go` needs to run `python -m pytest hub/tests/test_integration.py -v` once
before merging and confirm it actually passes.
"""
from __future__ import annotations

import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest
import requests

from hub.ast_builder import compile_row
from hub.card_table import MOVE_FORWARD
from hub.client import post_program

REPO_ROOT = Path(__file__).resolve().parents[2]

pytestmark = pytest.mark.skipif(shutil.which("go") is None, reason="go toolchain not on PATH in this environment")


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def server_base_url():
    port = _free_port()
    addr = f":{port}"
    proc = subprocess.Popen(
        ["go", "run", "./cmd/server", f"-addr={addr}", "-open=false", "-prewarm-hints=false"],
        cwd=REPO_ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    base_url = f"http://127.0.0.1:{port}"
    try:
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                if requests.get(f"{base_url}/api/levels", timeout=1).ok:
                    break
            except requests.RequestException:
                pass
            if proc.poll() is not None:
                pytest.fail(f"server exited early:\n{proc.stdout.read()}")
            time.sleep(0.5)
        else:
            pytest.fail("server did not become ready within 30s")
        yield base_url
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


def test_camera_program_solves_level_1(server_base_url):
    # DECISIONS.md: level-1 is "move only, 6-cell straight line, par 5" -- five
    # move-forward cards in a row is the straightforward solution.
    ids = [MOVE_FORWARD] * 5
    result = compile_row(ids)
    assert result.problems == []

    resp = post_program(result.program, level_id="level-1", api_base=server_base_url)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["outcome"] == "solved", body
