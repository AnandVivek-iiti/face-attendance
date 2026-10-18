import logging
import warnings
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.routes import router
from app.config import get_settings
from app.errors import AppError
from app.models.registry import ModelRegistry
from app.services.attendance import AttendanceService
from app.services.reference import ReferenceService

warnings.filterwarnings("ignore", category=FutureWarning, module="insightface")
logger = logging.getLogger("ml-service")


def error_body(code: str, message: str, details: list | None = None) -> dict:
    body = {"error": {"code": code, "message": message}}
    if details:
        body["error"]["details"] = details
    return body


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    if not settings.api_key:
        # Fail-open by design for local dev; make it loud because an unauthenticated service must never be exposed to the internet.
        logger.warning("API_KEY is not set: the ML endpoints are unauthenticated.")
    registry = ModelRegistry(settings)
    app.state.settings = settings
    app.state.registry = registry
    app.state.attendance = AttendanceService(registry, settings)
    app.state.reference = ReferenceService(registry, settings)
    yield


app = FastAPI(title="Face Attendance ML Service", version="1.0.0", lifespan=lifespan,
              docs_url=None, redoc_url=None, openapi_url=None)
app.include_router(router)


@app.exception_handler(AppError)
async def handle_app_error(_: Request, exc: AppError):
    return JSONResponse(status_code=exc.status_code, content=error_body(exc.code, exc.message))


@app.exception_handler(RequestValidationError)
async def handle_validation_error(_: Request, exc: RequestValidationError):
    details = [{"field": ".".join(str(p) for p in e["loc"]), "issue": e["type"]} for e in exc.errors()]
    return JSONResponse(status_code=422, content=error_body("INVALID_REQUEST", "Request validation failed", details))


@app.exception_handler(Exception)
async def handle_unexpected(_: Request, exc: Exception):
    logger.exception("unhandled error")
    return JSONResponse(status_code=500, content=error_body("INTERNAL_ERROR", "Internal processing error"))
