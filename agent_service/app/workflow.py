from typing import Protocol, TypedDict

from langgraph.graph import END, START, StateGraph

from app.models import TripPlan, TripPlanRequest


class Planner(Protocol):
    def generate(self, request: TripPlanRequest) -> TripPlan: ...


class AgentState(TypedDict, total=False):
    request: TripPlanRequest
    plan: TripPlan


def create_agent_graph(planner: Planner):
    def generate_plan(state: AgentState) -> AgentState:
        return {"plan": planner.generate(state["request"])}

    graph = StateGraph(AgentState)
    graph.add_node("generate_plan", generate_plan)
    graph.add_edge(START, "generate_plan")
    graph.add_edge("generate_plan", END)
    return graph.compile()


def generate_itinerary(request: TripPlanRequest, planner: Planner) -> TripPlan:
    result = create_agent_graph(planner).invoke({"request": request})
    return TripPlan.model_validate(result["plan"])
