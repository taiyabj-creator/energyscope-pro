from pydantic import BaseModel, Field


class UTLAuthRequest(BaseModel):
    email: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)
    device_id: str = Field(..., min_length=1)


class UTLTokenResponse(BaseModel):
    token: str | None = None
    success: bool = False
    message: str | None = None
