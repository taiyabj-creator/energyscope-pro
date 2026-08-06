from fastapi import APIRouter

from .health import router as health_router

api_router = APIRouter()
api_router.include_router(health_router)


@api_router.get("/status")
async def status() -> dict[str, str]:
    return {"status": "ok"}
