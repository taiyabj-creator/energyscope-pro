from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.logging import configure_logging
from app.exceptions.handlers import not_found_handler

configure_logging()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="EnergyScope FastAPI backend skeleton",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_prefix)
app.add_exception_handler(StarletteHTTPException, not_found_handler)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
