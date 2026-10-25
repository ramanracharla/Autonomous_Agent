import logging

from fastapi import Depends, FastAPI, HTTPException
from openai import (
    APIConnectionError,
    APIStatusError,
    AuthenticationError,
    OpenAIError,
    RateLimitError,
)

from app.models import TripPlan, TripPlanRequest
from app.planner import create_default_planner
from app.workflow import Planner, generate_itinerary

app = FastAPI(title="ICEPOT Agent Service", version="0.2.0")
logger = logging.getLogger(__name__)


def get_planner() -> Planner:
    try:
        return create_default_planner()
    except ValueError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.get("/health")
def health() -> dict[str, str | bool]:
    return {"success": True, "service": "icepot-agent-service", "status": "UP"}


@app.post("/api/v1/agent/plan", response_model=TripPlan)
def create_plan(
    request: TripPlanRequest,
    planner: Planner = Depends(get_planner),
) -> TripPlan:
    try:
        return generate_itinerary(request, planner)
    except AuthenticationError as error:
        logger.exception("OpenAI rejected the API key while generating an itinerary")
        raise HTTPException(
            status_code=502,
            detail="OpenAI rejected the API key. Verify OPENAI_API_KEY and restart the agent service.",
        ) from error
    except RateLimitError as error:
        logger.exception("OpenAI rate limit or quota error while generating an itinerary")
        raise HTTPException(
            status_code=502,
            detail="OpenAI rejected the request due to a rate limit or insufficient API quota. Check your OpenAI API usage and billing.",
        ) from error
    except APIConnectionError as error:
        logger.exception("Could not connect to OpenAI while generating an itinerary")
        raise HTTPException(
            status_code=502,
            detail="The agent service could not connect to OpenAI. Check network access and try again.",
        ) from error
    except APIStatusError as error:
        logger.exception(
            "OpenAI returned HTTP %s while generating an itinerary",
            error.status_code,
        )
        raise HTTPException(
            status_code=502,
            detail=f"OpenAI returned an error (HTTP {error.status_code}). Check the agent-service terminal for details.",
        ) from error
    except OpenAIError as error:
        logger.exception("OpenAI request failed while generating an itinerary")
        raise HTTPException(
            status_code=502,
            detail="The OpenAI request failed. Check the agent-service terminal for details.",
        ) from error
