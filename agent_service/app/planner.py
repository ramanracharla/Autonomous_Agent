import os

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from app.models import TripPlan, TripPlanRequest
from app.workflow import Planner


class OpenAIPlanner:
    def __init__(self, api_key: str, model: str) -> None:
        if not api_key:
            raise ValueError("OPENAI_API_KEY is required to generate itineraries")
        self._structured_model = ChatOpenAI(
            api_key=api_key,
            model=model,
            temperature=0,
        ).with_structured_output(TripPlan)

    def generate(self, request: TripPlanRequest) -> TripPlan:
        result = self._structured_model.invoke(
            [
                SystemMessage(
                    content=(
                        "Create a practical travel itinerary using only the traveler "
                        "constraints provided. Do not claim that flights, hotels, or "
                        "activities have been searched, priced, or booked. Dates in "
                        "the itinerary must fall within the requested trip dates."
                    )
                ),
                HumanMessage(
                    content=(
                        f"Trip request: {request.prompt}\n"
                        f"Origin: {request.origin}\n"
                        f"Destination: {request.destination}\n"
                        f"Start date: {request.start_date.isoformat()}\n"
                        f"End date: {request.end_date.isoformat()}\n"
                        f"Travelers: {request.travelers}"
                    )
                ),
            ]
        )
        return TripPlan.model_validate(result)


def create_default_planner() -> OpenAIPlanner:
    return OpenAIPlanner(
        api_key=os.getenv("OPENAI_API_KEY", ""),
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
    )
