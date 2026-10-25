from datetime import date

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TripPlanRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    prompt: str = Field(min_length=1, max_length=4000)
    origin: str = Field(min_length=3, max_length=100)
    destination: str = Field(min_length=2, max_length=100)
    start_date: date = Field(alias="startDate")
    end_date: date = Field(alias="endDate")
    travelers: int = Field(ge=1, le=20)

    @model_validator(mode="after")
    def validate_date_range(self) -> "TripPlanRequest":
        if self.end_date < self.start_date:
            raise ValueError("endDate must be on or after startDate")
        return self


class ItineraryDay(BaseModel):
    date: date
    title: str
    activities: list[str] = Field(min_length=1)


class TripPlan(BaseModel):
    title: str
    summary: str
    days: list[ItineraryDay] = Field(min_length=1)
    estimated_total_cost: float | None = Field(default=None, ge=0)
