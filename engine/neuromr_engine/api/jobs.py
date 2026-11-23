"""Cancellable background jobs with progress events (GEN-223).

A job is a pure function ``fn(params, progress)``. It reports progress with ``progress(fraction, stage)``;
that call raises :class:`JobCancelled` once the job has been cancelled, so a job stops at its next
progress point and never gets to write its results. Events use the ``JobEvent`` contract in
``packages/contracts/src/engine.ts``.
"""

from __future__ import annotations

import threading
import uuid
from collections.abc import Callable, Mapping
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any

Progress = Callable[[float, str], None]
JobFn = Callable[[Mapping[str, Any], Progress], None]
Event = dict[str, Any]


class JobCancelled(Exception):
    """Raised inside a job by ``progress()`` after the job was cancelled."""


class UnknownJobKind(KeyError):
    pass


@dataclass
class _Job:
    id: str
    kind: str
    cancel: threading.Event = field(default_factory=threading.Event)
    state: str = "running"  # running | done | cancelled | error


class JobManager:
    def __init__(self, publish: Callable[[Event], None], workers: int = 2) -> None:
        self._publish = publish
        self._kinds: dict[str, JobFn] = {}
        self._jobs: dict[str, _Job] = {}
        self._lock = threading.Lock()
        self._pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="job")

    def register(self, kind: str, fn: JobFn) -> None:
        self._kinds[kind] = fn

    def kinds(self) -> list[str]:
        return sorted(self._kinds)

    def start(self, kind: str, params: Mapping[str, Any]) -> str:
        fn = self._kinds.get(kind)
        if fn is None:
            raise UnknownJobKind(kind)
        job = _Job(id=uuid.uuid4().hex, kind=kind)
        with self._lock:
            self._jobs[job.id] = job
        self._pool.submit(self._run, job, fn, dict(params))
        return job.id

    def cancel(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
        if job is None or job.state != "running":
            return False
        job.cancel.set()
        return True

    def state(self, job_id: str) -> str | None:
        with self._lock:
            job = self._jobs.get(job_id)
        return job.state if job else None

    def shutdown(self) -> None:
        with self._lock:
            jobs = list(self._jobs.values())
        for job in jobs:
            job.cancel.set()
        # Queued jobs still pass through _run, see the cancel flag and report "cancelled" at once.
        self._pool.shutdown(wait=True)

    def _run(self, job: _Job, fn: JobFn, params: dict[str, Any]) -> None:
        def progress(fraction: float, stage: str) -> None:
            if job.cancel.is_set():
                raise JobCancelled
            frac = min(1.0, max(0.0, float(fraction)))
            self._publish({"kind": "progress", "jobId": job.id, "fraction": frac, "stage": stage})

        try:
            if job.cancel.is_set():
                raise JobCancelled
            fn(params, progress)
            if job.cancel.is_set():
                raise JobCancelled
            job.state = "done"
            self._publish({"kind": "done", "jobId": job.id})
        except JobCancelled:
            job.state = "cancelled"
            self._publish({"kind": "cancelled", "jobId": job.id})
        except Exception as exc:  # reported to the user as a one-line failure, never as done
            job.state = "error"
            self._publish({"kind": "error", "jobId": job.id, "message": f"{type(exc).__name__}: {exc}"})
