from .client import UTLClient
from .constants import UTL_AUTH_PATH
from .exceptions import UTLRequestError
from .models import UTLAuthRequest, UTLTokenResponse


class UTLAuthManager:
    """Handles authentication and token management for the UTL API."""

    def __init__(self, client: UTLClient | None = None) -> None:
        self.client = client or UTLClient()

    def login(self, email: str, password: str, device_id: str) -> UTLTokenResponse:
        payload = UTLAuthRequest(email=email, password=password, device_id=device_id)
        response = self.client.request_json(
            "POST",
            UTL_AUTH_PATH,
            payload=payload.model_dump(),
        )

        if not isinstance(response, dict):
            raise UTLRequestError("UTL login response was not a JSON object")

        token_response = UTLTokenResponse(**response)
        if not token_response.success:
            raise UTLRequestError(token_response.message or "UTL login failed")

        if not token_response.token:
            raise UTLRequestError("UTL login did not return a token")

        return token_response
