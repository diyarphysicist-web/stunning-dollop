"""FastAPI application: per-session token on every request (GEN-220), health, jobs and events (GEN-223)."""

from __future__ import annotations

import asyncio
import hmac
import os
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Request, WebSocket
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from neuromr_engine import __version__
from neuromr_engine.api.jobs import Event, JobManager, UnknownJobKind

WS_PROTOCOL = "neuromr.v1"


class JobRequest(BaseModel):
    kind: str = Field(min_length=1)
    params: dict[str, Any] = Field(default_factory=dict)


def _token_ok(expected: str, presented: str | None) -> bool:
    return presented is not None and hmac.compare_digest(expected.encode(), presented.encode())


def create_app(token: str, on_shutdown: Callable[[], None] | None = None, workers: int = 2) -> FastAPI:
    if len(token) < 32:
        raise ValueError("session token too short")
    subscribers: set[asyncio.Queue[Event]] = set()
    loop_ref: dict[str, asyncio.AbstractEventLoop] = {}

    def publish(event: Event) -> None:
        loop = loop_ref.get("loop")
        if loop is None:
            return
        for q in list(subscribers):
            loop.call_soon_threadsafe(q.put_nowait, event)

    jobs = JobManager(publish, workers=workers)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        loop_ref["loop"] = asyncio.get_running_loop()
        yield
        await asyncio.to_thread(jobs.shutdown)

    # No interactive docs or schema endpoint: the engine is an internal service.
    no_docs: dict[str, Any] = {"docs_url": None, "redoc_url": None, "openapi_url": None}
    app = FastAPI(title="NeuroMR-PRO engine", version=__version__, lifespan=lifespan, **no_docs)
    app.state.jobs = jobs

    @app.middleware("http")
    async def require_token(request: Request, call_next):  # type: ignore[no-untyped-def]
        header = request.headers.get("authorization", "")
        presented = header[7:] if header.lower().startswith("bearer ") else None
        if not _token_ok(token, presented):
            return JSONResponse({"detail": "unauthorized"}, status_code=401)
        return await call_next(request)

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {"status": "ok", "version": __version__, "pid": os.getpid()}

    @app.get("/jobs/kinds")
    async def job_kinds() -> list[str]:
        return jobs.kinds()

    @app.post("/jobs", status_code=202)
    async def start_job(req: JobRequest) -> dict[str, str]:
        try:
            return {"jobId": jobs.start(req.kind, req.params)}
        except UnknownJobKind as exc:
            raise HTTPException(status_code=404, detail=f"unknown job kind {req.kind}") from exc

    @app.delete("/jobs/{job_id}")
    async def cancel_job(job_id: str) -> dict[str, bool]:
        if jobs.state(job_id) is None:
            raise HTTPException(status_code=404, detail="unknown job")
        return {"cancelling": jobs.cancel(job_id)}

    @app.post("/shutdown", status_code=202)
    async def shutdown() -> dict[str, bool]:
        if on_shutdown is not None:
            on_shutdown()
        return {"stopping": True}

    @app.websocket("/events")
    async def events(ws: WebSocket) -> None:
        # Browsers and Node cannot set headers on a WebSocket, so the token travels as a subprotocol.
        offered = ws.scope.get("subprotocols") or []
        if WS_PROTOCOL not in offered or not any(_token_ok(token, p) for p in offered):
            await ws.close(code=1008)
            return
        await ws.accept(subprotocol=WS_PROTOCOL)
        queue: asyncio.Queue[Event] = asyncio.Queue()
        subscribers.add(queue)
        try:
            receiver = asyncio.create_task(ws.receive_text())
            while True:
                getter = asyncio.create_task(queue.get())
                done, _ = await asyncio.wait({getter, receiver}, return_when=asyncio.FIRST_COMPLETED)
                if receiver in done:  # client closed (or sent something we do not expect)
                    getter.cancel()
                    break
                await ws.send_json(getter.result())
        except Exception:  # connection dropped
            pass
        finally:
            subscribers.discard(queue)

    return app
