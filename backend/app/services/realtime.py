"""WebSocket 실시간 알림 허브 (규격 6.9, 6.11).

클라이언트가 ws://<서버>/api/v1/ws 에 연결하면 아래 모양의 메시지를 받아요.
    {"type": "report.created", "data": {...}}
프론트는 받은 type에 맞는 TanStack Query 키를 다시 불러오기(invalidate)만 하면 돼요.

주소에 ?token=<JWT> 를 붙이면 "로그인한 연결"로 기억해서 아래 알림도 받아요.
- presence.updated / presence.removed : 로그인한 연결 모두에게
- invite.received                    : 받는 사람의 연결에만
Uvicorn 워커 1개로 돌리는 전제라서 메모리 안의 목록만으로 충분해요.
"""

import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger("hyeonpung")


class Hub:
    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()
        # 로그인한 연결만: 연결 → 사용자 정수 id (한 사람이 여러 탭을 열 수 있어요)
        self.users: dict[WebSocket, int] = {}

    async def connect(self, ws: WebSocket, user_id: int | None = None) -> None:
        await ws.accept()
        self.clients.add(ws)
        if user_id is not None:
            self.users[ws] = user_id
        await self.broadcast("online.count", {"count": len(self.clients)})

    async def disconnect(self, ws: WebSocket) -> None:
        self._drop(ws)
        await self.broadcast("online.count", {"count": len(self.clients)})

    def _drop(self, ws: WebSocket) -> None:
        self.clients.discard(ws)
        self.users.pop(ws, None)

    async def _send(self, targets: list[WebSocket], event: str, data: Any) -> None:
        """여러 연결에 보내요. 끊긴 연결은 조용히 빼요."""
        message = {"type": event, "data": data}
        for client in targets:
            try:
                await client.send_json(message)
            except Exception:  # 연결이 끊긴 경우
                self._drop(client)

    async def broadcast(self, event: str, data: Any) -> None:
        """연결된 모두에게 보내요 (공개 알림)."""
        await self._send(list(self.clients), event, data)

    async def broadcast_logged_in(self, event: str, data: Any) -> None:
        """로그인한 연결에만 보내요 (실시간 위치처럼 로그인해야 볼 수 있는 알림)."""
        await self._send(list(self.users), event, data)

    async def send_to_user(self, user_id: int, event: str, data: Any) -> None:
        """한 사람의 연결(여러 탭 포함)에만 보내요."""
        await self._send([ws for ws, uid in list(self.users.items()) if uid == user_id], event, data)


hub = Hub()
