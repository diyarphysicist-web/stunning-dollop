"""Engine entry point used by the desktop supervisor (GEN-220, GEN-224).

    python -m neuromr_engine.api

Reads the per-session token from the first line of standard input, binds 127.0.0.1 on a port the
operating system chooses, and prints one line ``NEUROMR_ENGINE_READY {"port": N}`` to standard output.
When standard input closes (the application has gone away) the engine shuts down by itself.
"""

from __future__ import annotations

import json
import logging
import socket
import sys
import threading

import uvicorn

from neuromr_engine.api.app import create_app

READY = "NEUROMR_ENGINE_READY"


def main() -> int:
    token = sys.stdin.readline().strip()
    if len(token) < 32:
        print("engine: no session token on standard input", file=sys.stderr)
        return 2

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]

    server: uvicorn.Server | None = None

    def stop() -> None:
        if server is not None:
            server.should_exit = True

    app = create_app(token, on_shutdown=stop)
    config = uvicorn.Config(app, log_level="warning", access_log=False, lifespan="on", ws="websockets")
    server = uvicorn.Server(config)

    def watch_parent() -> None:
        # EOF on stdin means the application exited or closed the pipe: never outlive it.
        while sys.stdin.readline():
            pass
        stop()

    threading.Thread(target=watch_parent, name="parent-watch", daemon=True).start()
    logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(levelname)s %(name)s %(message)s")

    def announce() -> None:
        while not server.started:
            if server.should_exit:
                return
            threading.Event().wait(0.02)
        print(f"{READY} {json.dumps({'port': port})}", flush=True)

    threading.Thread(target=announce, name="announce", daemon=True).start()
    server.run(sockets=[sock])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
