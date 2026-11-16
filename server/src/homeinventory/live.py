"""Live updates: Server-Sent Events that tell open pages something changed.

The message only says that the house changed and who changed it; the page fetches it
again. One process (a single Uvicorn worker) holds every listener in memory.
"""

import asyncio
import json
from collections.abc import AsyncIterator

# A comment line now and then, so proxies keep the connection open.
KEEPALIVE_SECONDS = 25


class LiveUpdates:
    def __init__(self) -> None:
        self._queues: set[asyncio.Queue[str]] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def attach(self, loop: asyncio.AbstractEventLoop) -> None:
        """The event loop the listeners run on; set when the app starts."""
        self._loop = loop

    def publish(self, by: int | None) -> None:
        """Tells every listener the house changed. Safe to call from any thread."""
        if self._loop is None:
            return
        data = json.dumps({"by": by})
        self._loop.call_soon_threadsafe(self._fan_out, data)

    def _fan_out(self, data: str) -> None:
        for queue in self._queues:
            # A listener that stopped reading misses updates; it refetches on reconnect.
            if queue.qsize() < 100:
                queue.put_nowait(data)

    async def stream(self, disconnected) -> AsyncIterator[str]:
        """The event stream for one listener, until it goes away."""
        queue: asyncio.Queue[str] = asyncio.Queue()
        self._queues.add(queue)
        try:
            # Reconnect after 3 s if the connection drops.
            yield "retry: 3000\n\n"
            while not await disconnected():
                try:
                    data = await asyncio.wait_for(queue.get(), KEEPALIVE_SECONDS)
                except TimeoutError:
                    yield ": keepalive\n\n"
                else:
                    yield f"data: {data}\n\n"
        finally:
            self._queues.discard(queue)

    @property
    def listeners(self) -> int:
        return len(self._queues)
