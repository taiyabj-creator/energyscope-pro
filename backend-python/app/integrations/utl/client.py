import json
from typing import Any
from urllib import error, request

from .constants import UTL_BASE_URL
from .exceptions import UTLRequestError


class UTLClient:
    """Small HTTP client for communicating with the UTL API."""

    def __init__(self, base_url: str = UTL_BASE_URL) -> None:
        self.base_url = base_url.rstrip("/")

    def request_json(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        timeout: int = 10,
    ) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        body = None
        request_headers = {"Accept": "application/json"}

        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
            request_headers["Content-Type"] = "application/json"

        if headers:
            request_headers.update(headers)

        req = request.Request(url, data=body, headers=request_headers, method=method)

        try:
            with request.urlopen(req, timeout=timeout) as response:
                payload_bytes = response.read()
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise UTLRequestError(f"UTL request failed with status {exc.code}: {detail}") from exc
        except error.URLError as exc:
            raise UTLRequestError(f"Unable to reach UTL endpoint: {exc.reason}") from exc

        if not payload_bytes:
            return {}

        try:
            return json.loads(payload_bytes.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise UTLRequestError("UTL returned invalid JSON") from exc
