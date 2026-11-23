"""Engine server: token (GEN-220), health, jobs and events (GEN-223), shutdown (GEN-224)."""

import json
import secrets
import subprocess
import sys
import threading
import time
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from neuromr_engine import __version__
from neuromr_engine.api.app import WS_PROTOCOL, create_app
from neuromr_engine.api.jobs import JobManager

TOKEN = secrets.token_hex(32)
AUTH = {"Authorization": f"Bearer {TOKEN}"}
WS_AUTH = [WS_PROTOCOL, TOKEN]
ENGINE_CMD = [sys.executable, "-m", "neuromr_engine.api"]
ENGINE_DIR = Path(__file__).resolve().parents[1]


def slow_job(params, progress):
    steps = int(params.get("steps", 5))
    for i in range(steps):
        progress(i / steps, f"step {i + 1}")
        time.sleep(float(params.get("delay", 0.0)))
    progress(1.0, "finishing")


def failing_job(params, progress):
    progress(0.5, "half")
    raise RuntimeError("fit did not converge")


@pytest.fixture
def client():
    app = create_app(TOKEN)
    app.state.jobs.register("slow", slow_job)
    app.state.jobs.register("fail", failing_job)
    with TestClient(app) as c:
        yield c


def test_gen220_rejects_missing_or_wrong_token(client):
    assert client.get("/health").status_code == 401
    assert client.get("/health", headers={"Authorization": "Bearer " + "0" * 64}).status_code == 401
    assert client.get("/health", headers={"Authorization": TOKEN}).status_code == 401
    assert client.post("/jobs", json={"kind": "slow"}).status_code == 401
    assert client.get("/nope").status_code == 401  # rejected before routing


def test_gen220_short_token_refused():
    with pytest.raises(ValueError):
        create_app("short")


def test_health_matches_contract(client):
    r = client.get("/health", headers=AUTH)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and body["version"] == __version__ and body["pid"] > 0


def test_gen220_websocket_requires_token(client):
    for protocols in ([WS_PROTOCOL], [WS_PROTOCOL, "0" * 64], [TOKEN]):
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/events", subprotocols=protocols) as ws:
                ws.receive_json()


def _start(client, kind, **params):
    return client.post("/jobs", json={"kind": kind, "params": params}, headers=AUTH).json()["jobId"]


def _collect(ws, job_id, until):
    events = []
    while True:
        ev = ws.receive_json()
        if ev["jobId"] != job_id:
            continue
        events.append(ev)
        if ev["kind"] in until:
            return events


def test_gen223_progress_then_done(client):
    with client.websocket_connect("/events", subprotocols=WS_AUTH) as ws:
        job_id = _start(client, "slow", steps=4)
        events = _collect(ws, job_id, {"done", "error", "cancelled"})
    assert events[-1] == {"kind": "done", "jobId": job_id}
    fractions = [e["fraction"] for e in events if e["kind"] == "progress"]
    assert fractions == sorted(fractions) and fractions[-1] == 1.0
    assert all(e["stage"] for e in events if e["kind"] == "progress")


def test_gen223_cancel_stops_at_next_progress_point(client):
    with client.websocket_connect("/events", subprotocols=WS_AUTH) as ws:
        job_id = _start(client, "slow", steps=200, delay=0.02)
        _collect(ws, job_id, {"progress"})
        t0 = time.monotonic()
        assert client.delete(f"/jobs/{job_id}", headers=AUTH).json() == {"cancelling": True}
        events = _collect(ws, job_id, {"done", "error", "cancelled"})
    assert events[-1] == {"kind": "cancelled", "jobId": job_id}
    assert time.monotonic() - t0 < 1.0
    assert client.delete(f"/jobs/{job_id}", headers=AUTH).json() == {"cancelling": False}


def test_gen223_failure_is_reported_never_done(client):
    with client.websocket_connect("/events", subprotocols=WS_AUTH) as ws:
        job_id = _start(client, "fail")
        events = _collect(ws, job_id, {"done", "error", "cancelled"})
    assert events[-1]["kind"] == "error" and "did not converge" in events[-1]["message"]


def test_unknown_job_kind_and_id(client):
    assert client.post("/jobs", json={"kind": "nope"}, headers=AUTH).status_code == 404
    assert client.delete("/jobs/abc", headers=AUTH).status_code == 404
    assert client.get("/jobs/kinds", headers=AUTH).json() == ["fail", "slow"]


def test_cancel_before_start_never_runs():
    events = []
    gate = threading.Event()
    mgr = JobManager(events.append, workers=1)
    mgr.register("block", lambda p, progress: gate.wait(2))
    mgr.register("never", lambda p, progress: events.append({"kind": "ran"}))
    first = mgr.start("block", {})
    second = mgr.start("never", {})
    assert mgr.cancel(second)
    gate.set()
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline and "running" in (mgr.state(first), mgr.state(second)):
        time.sleep(0.01)
    mgr.shutdown()
    assert {"kind": "ran"} not in events
    assert {"kind": "cancelled", "jobId": second} in events
    assert {"kind": "done", "jobId": first} in events


def _start_engine():
    proc = subprocess.Popen(
        ENGINE_CMD,
        cwd=ENGINE_DIR,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    proc.stdin.write(TOKEN + "\n")
    proc.stdin.flush()
    line = proc.stdout.readline()
    assert line.startswith("NEUROMR_ENGINE_READY "), line + proc.stderr.read()
    return proc, json.loads(line.split(" ", 1)[1])["port"]


def test_gen220_gen224_process_binds_localhost_and_exits_on_stdin_close():
    proc, port = _start_engine()
    try:
        assert proc.args[-1] == "neuromr_engine.api" and TOKEN not in " ".join(proc.args)
        r = httpx.get(f"http://127.0.0.1:{port}/health", headers=AUTH, timeout=5)
        # On Windows a venv python.exe is a launcher whose child is the real interpreter, so the engine
        # pid can differ from the spawned pid; the supervisor stops the whole process tree for that reason.
        assert r.status_code == 200 and r.json()["pid"] > 0
        proc.stdin.close()  # the application went away
        assert proc.wait(timeout=10) == 0
    finally:
        if proc.poll() is None:
            proc.kill()


def test_queued_jobs_report_cancelled_on_shutdown():
    events = []
    gate = threading.Event()
    mgr = JobManager(events.append, workers=1)
    mgr.register("block", lambda p, progress: gate.wait(2))
    mgr.start("block", {})
    queued = mgr.start("block", {})
    threading.Timer(0.1, gate.set).start()
    mgr.shutdown()
    assert {"kind": "cancelled", "jobId": queued} in events
    assert not any(e["kind"] == "done" for e in events)


def test_gen224_shutdown_endpoint_stops_process():
    proc, port = _start_engine()
    try:
        assert httpx.post(f"http://127.0.0.1:{port}/shutdown", headers=AUTH, timeout=5).status_code == 202
        assert proc.wait(timeout=10) == 0
    finally:
        if proc.poll() is None:
            proc.kill()


def test_gen220_process_refuses_to_start_without_token():
    proc = subprocess.run(ENGINE_CMD, cwd=ENGINE_DIR, input="\n", capture_output=True, text=True, timeout=30)
    assert proc.returncode == 2 and "token" in proc.stderr
