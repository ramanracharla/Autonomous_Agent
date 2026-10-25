// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("trip planning dashboard", () => {
  it("submits the trip request and renders the returned itinerary", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          title: "Tokyo in good time",
          summary: "A slower-paced city escape.",
          estimated_total_cost: 1200,
          days: [
            {
              date: "2026-11-10",
              title: "Find your bearings",
              activities: ["Explore the neighborhood"]
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /create my itinerary/i }));

    expect(await screen.findByText("Tokyo in good time")).toBeTruthy();
    expect(screen.getByText("Find your bearings")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/agent-api/api/v1/agent/plan",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining('"destination":"Tokyo"')
      })
    );
  });

  it("shows explicit agent service errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "OPENAI_API_KEY is required" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /create my itinerary/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "OPENAI_API_KEY is required"
      );
    });
  });

  it("explains when the agent service returns an empty response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 502 })));

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /create my itinerary/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "agent service returned an empty response (HTTP 502)"
      );
      expect(screen.getByRole("alert").textContent).toContain("OPENAI_API_KEY");
    });
  });

  it("connects to the authenticated SSE endpoint and renders trip events", async () => {
    const event = {
      type: "agent_thought",
      timestamp: "2026-10-24T10:05:02Z",
      step: "ANALYZING_FLIGHTS",
      message: "Comparing available routes."
    };
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `: connected\n\nevent: agent_thought\ndata: ${JSON.stringify(event)}\n\n`
          )
        );
        controller.close();
      }
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.change(screen.getByRole("textbox", { name: "Trip ID" }), {
      target: { value: "65f1a2b3c4d5e6f7a8b9c0b2" }
    });
    fireEvent.change(screen.getByLabelText("Stream access token"), {
      target: { value: "test-token" }
    });
    fireEvent.click(screen.getByRole("button", { name: /connect to updates/i }));

    expect(await screen.findByText("Comparing available routes.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/trips/65f1a2b3c4d5e6f7a8b9c0b2/stream",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
          Accept: "text/event-stream"
        })
      })
    );
  });

  it("renders flight disruption alerts from the SSE stream", async () => {
    const event = {
      type: "disruption_alert",
      timestamp: "2026-10-24T10:05:02Z",
      bookingId: "65f1a2b3c4d5e6f7a8b9c0c3",
      status: "DELAYED",
      delayMinutes: 120,
      message: "Flight IP100 is delayed by 120 minutes."
    };
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `event: disruption_alert\ndata: ${JSON.stringify(event)}\n\n`
          )
        );
        controller.close();
      }
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(body, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" }
        })
      )
    );

    render(<App />);
    fireEvent.change(screen.getByRole("textbox", { name: "Trip ID" }), {
      target: { value: "65f1a2b3c4d5e6f7a8b9c0b2" }
    });
    fireEvent.change(screen.getByLabelText("Stream access token"), {
      target: { value: "test-token" }
    });
    fireEvent.click(screen.getByRole("button", { name: /connect to updates/i }));

    expect(await screen.findByText("FLIGHT DELAYED")).toBeTruthy();
    expect(screen.getByText(event.message)).toBeTruthy();
  });
});
