from datetime import date

from fastapi import HTTPException
from fastapi.testclient import TestClient
from openai import OpenAIError
from pytest import MonkeyPatch

from app.main import app, create_plan, get_planner
from app.models import ItineraryDay, TripPlan, TripPlanRequest
from app.workflow import generate_itinerary


class MockPlanner:
    def generate(self, request: TripPlanRequest) -> TripPlan:
        return TripPlan(
            title=f"{request.destination} trip",
            summary="A sample itinerary for testing.",
            days=[
                ItineraryDay(
                    date=request.start_date,
                    title="Arrival",
                    activities=["Check in and explore nearby"],
                )
            ],
            estimated_total_cost=1000,
        )


def test_workflow_generates_itinerary_with_mock_planner() -> None:
    request = TripPlanRequest(
        prompt="Plan a short city break",
        origin="SFO",
        destination="Tokyo",
        startDate="2026-11-10",
        endDate="2026-11-12",
        travelers=1,
    )

    plan = generate_itinerary(request, MockPlanner())

    assert plan.title == "Tokyo trip"
    assert plan.days[0].date == date(2026, 11, 10)


def test_health_endpoint() -> None:
    response = TestClient(app).get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "service": "icepot-agent-service",
        "status": "UP",
    }


def test_plan_endpoint_uses_injected_planner() -> None:
    app.dependency_overrides[get_planner] = MockPlanner
    try:
        response = TestClient(app).post(
            "/api/v1/agent/plan",
            json={
                "prompt": "Plan a short city break",
                "origin": "SFO",
                "destination": "Tokyo",
                "startDate": "2026-11-10",
                "endDate": "2026-11-12",
                "travelers": 1,
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["title"] == "Tokyo trip"
    assert response.json()["days"][0]["date"] == "2026-11-10"


def test_plan_endpoint_requires_llm_configuration(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    response = TestClient(app).post(
        "/api/v1/agent/plan",
        json={
            "prompt": "Plan a short city break",
            "origin": "SFO",
            "destination": "Tokyo",
            "startDate": "2026-11-10",
            "endDate": "2026-11-12",
            "travelers": 1,
        },
    )

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "OPENAI_API_KEY is required to generate itineraries"
    )


def test_plan_endpoint_reports_openai_errors() -> None:
    class FailingPlanner:
        def generate(self, request: TripPlanRequest) -> TripPlan:
            raise OpenAIError("provider failure")

    request = TripPlanRequest(
        prompt="Plan a short city break",
        origin="SFO",
        destination="Tokyo",
        startDate="2026-11-10",
        endDate="2026-11-12",
        travelers=1,
    )

    try:
        create_plan(request, FailingPlanner())
    except HTTPException as error:
        assert error.status_code == 502
        assert error.detail == (
            "The OpenAI request failed. Check the agent-service terminal for details."
        )
    else:
        raise AssertionError("Expected an HTTPException for an OpenAI error")
