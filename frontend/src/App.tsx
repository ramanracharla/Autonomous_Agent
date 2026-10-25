import { useState, type FormEvent } from "react";
import { useTripEvents, type TripEvent } from "./useTripEvents";

interface ItineraryDay {
  date: string;
  title: string;
  activities: string[];
}

interface Itinerary {
  title: string;
  summary: string;
  days: ItineraryDay[];
  estimated_total_cost?: number | null;
}

const initialForm = {
  prompt: "A mix of neighborhood food spots, design, and quiet moments",
  origin: "SFO",
  destination: "Tokyo",
  startDate: "2026-11-10",
  endDate: "2026-11-15",
  travelers: "1"
};

export function App() {
  const [form, setForm] = useState(initialForm);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [tripId, setTripId] = useState("");
  const [streamToken, setStreamToken] = useState("");
  const [streamEnabled, setStreamEnabled] = useState(false);
  const { events, status, error: streamError } = useTripEvents(
    tripId.trim(),
    streamToken,
    streamEnabled
  );

  async function submitPlan(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPlanning(true);
    setPlanError(null);
    setItinerary(null);
    try {
      const response = await fetch("/agent-api/api/v1/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: form.prompt,
          origin: form.origin,
          destination: form.destination,
          startDate: form.startDate,
          endDate: form.endDate,
          travelers: Number(form.travelers)
        })
      });
      const responseBody = await response.text();
      if (!responseBody.trim()) {
        throw new Error(
          `The agent service returned an empty response (HTTP ${response.status}). Check that it is running and configured with OPENAI_API_KEY.`
        );
      }

      let result: unknown;
      try {
        result = JSON.parse(responseBody);
      } catch {
        if (!response.ok) {
          throw new Error(
            `Planning request failed (${response.status}): ${responseBody.slice(0, 200)}`
          );
        }
        throw new Error("The agent service returned a non-JSON response");
      }
      if (!response.ok) {
        const detail =
          typeof result === "object" &&
          result !== null &&
          "detail" in result &&
          typeof result.detail === "string"
            ? result.detail
            : `Planning request failed (${response.status})`;
        throw new Error(detail);
      }
      setItinerary(parseItinerary(result));
    } catch (cause) {
      setPlanError(
        cause instanceof Error ? cause.message : "Unable to generate this itinerary"
      );
    } finally {
      setPlanning(false);
    }
  }

  async function exportItineraryPdf(): Promise<void> {
    if (!tripId.trim() || !streamToken) {
      setPdfError("Enter a trip ID and stream token in Live trip updates before exporting.");
      return;
    }
    if (!itinerary) return;
    setExportingPdf(true);
    setPdfError(null);
    try {
      const response = await fetch(
        `/api/v1/trips/${encodeURIComponent(tripId.trim())}/export/pdf`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${streamToken}`
          },
          body: JSON.stringify({
            title: itinerary.title,
            summary: itinerary.summary,
            currency: "USD",
            ...(itinerary.estimated_total_cost !== undefined &&
            itinerary.estimated_total_cost !== null
              ? { estimatedTotalCost: itinerary.estimated_total_cost }
              : {}),
            days: itinerary.days
          })
        }
      );
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const detail =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : `PDF export failed (${response.status})`;
        throw new Error(detail);
      }
      const pdf = await response.blob();
      const downloadUrl = URL.createObjectURL(pdf);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `trip-${tripId.trim()}.pdf`;
      link.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (cause) {
      setPdfError(cause instanceof Error ? cause.message : "Unable to export itinerary PDF");
    } finally {
      setExportingPdf(false);
    }
  }

  function connectStream(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setStreamEnabled(false);
    window.setTimeout(() => setStreamEnabled(true), 0);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Travel Agent home">
          <span className="brand-mark" aria-hidden="true">i</span>
          <span>Travel Agent<span className="brand-period">.</span></span>
        </a>
        <nav aria-label="Main navigation" className="main-nav">
          <a className="nav-active" href="#planner">Trip planner</a>
          <a href="#live-updates">Live updates</a>
        </nav>
        <div className="profile-chip" aria-label="Personal workspace">
          <span className="profile-avatar">A</span>
          <span>My workspace</span>
          <span className="chevron" aria-hidden="true">⌄</span>
        </div>
      </header>

      <section className="welcome-band">
        <div className="welcome-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> YOUR NEXT CHAPTER</div>
          <h1>Somewhere wonderful<br />starts <em>right here.</em></h1>
          <p>Thoughtful plans for the way you really want to travel.</p>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="sun-disc" />
          <div className="art-arch art-arch-back" />
          <div className="art-arch art-arch-front" />
          <div className="art-path" />
          <span className="art-spark spark-one">✳</span>
          <span className="art-spark spark-two">✳</span>
        </div>
        <div className="trip-counter"><span>01</span> / YOUR JOURNEY</div>
      </section>

      <div className="content-grid">
        <section className="planner-card card" id="planner">
          <div className="section-heading">
            <div>
              <div className="eyebrow muted">A LITTLE INSPIRATION GOES A LONG WAY</div>
              <h2>Where to next?</h2>
            </div>
            <span className="heading-icon" aria-hidden="true">↗</span>
          </div>
          <form className="planner-form" onSubmit={submitPlan}>
            <label className="field-label" htmlFor="trip-prompt">What would make this trip yours?</label>
            <textarea
              id="trip-prompt"
              rows={2}
              maxLength={4000}
              required
              value={form.prompt}
              onChange={(event) => setForm({ ...form, prompt: event.target.value })}
            />
            <div className="form-grid">
              <label>
                <span className="field-label">Flying from</span>
                <input
                  value={form.origin}
                  maxLength={100}
                  required
                  onChange={(event) => setForm({ ...form, origin: event.target.value })}
                />
              </label>
              <label>
                <span className="field-label">Going to</span>
                <input
                  value={form.destination}
                  maxLength={100}
                  required
                  onChange={(event) => setForm({ ...form, destination: event.target.value })}
                />
              </label>
            </div>
            <div className="form-grid date-grid">
              <label>
                <span className="field-label">From</span>
                <input
                  type="date"
                  value={form.startDate}
                  required
                  onChange={(event) => setForm({ ...form, startDate: event.target.value })}
                />
              </label>
              <label>
                <span className="field-label">Until</span>
                <input
                  type="date"
                  min={form.startDate}
                  value={form.endDate}
                  required
                  onChange={(event) => setForm({ ...form, endDate: event.target.value })}
                />
              </label>
              <label>
                <span className="field-label">Travelers</span>
                <select
                  value={form.travelers}
                  onChange={(event) => setForm({ ...form, travelers: event.target.value })}
                >
                  {[1, 2, 3, 4, 5, 6].map((count) => (
                    <option key={count} value={count}>{count} {count === 1 ? "traveler" : "travelers"}</option>
                  ))}
                </select>
              </label>
            </div>
            {planError && <p className="error-message" role="alert">{planError}</p>}
            <button className="primary-button" type="submit" disabled={planning}>
              {planning ? "Dreaming up your trip…" : "Create my itinerary"}
              <span aria-hidden="true">↗</span>
            </button>
            <p className="form-footnote">Your plan is a starting point, made just for you.</p>
          </form>
        </section>

        <section className="itinerary-card card" aria-live="polite">
          {itinerary ? (
            <ItineraryView
              itinerary={itinerary}
              onExportPdf={exportItineraryPdf}
              exportingPdf={exportingPdf}
              pdfError={pdfError}
            />
          ) : (
            <div className="empty-itinerary">
              <div className="empty-icon" aria-hidden="true">
                <span className="empty-icon-sun" />
                <span className="empty-icon-hill" />
                <span className="empty-icon-line" />
              </div>
              <span className="eyebrow muted">YOUR CANVAS AWAITS</span>
              <h2>A trip that feels<br />like <em>you.</em></h2>
              <p>Share a few details and we’ll shape them into a day-by-day plan.</p>
              <div className="empty-details">
                <span><i className="detail-dot coral" />Made around your pace</span>
                <span><i className="detail-dot green" />Room for happy detours</span>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="live-section card" id="live-updates">
        <div className="live-heading">
          <div className="live-icon" aria-hidden="true"><span>◉</span></div>
          <div>
            <div className="eyebrow muted">THE JOURNEY, AS IT UNFOLDS</div>
            <h2>Live trip updates</h2>
          </div>
          <StreamBadge status={status} />
        </div>
        <form className="stream-form" onSubmit={connectStream}>
          <label>
            <span className="field-label">Trip ID</span>
            <input
              value={tripId}
              required
              placeholder="Your 24-character trip ID"
              onChange={(event) => setTripId(event.target.value)}
            />
          </label>
          <label>
            <span className="field-label">Stream access token</span>
            <input
              type="password"
              value={streamToken}
              required
              placeholder="Bearer token"
              onChange={(event) => setStreamToken(event.target.value)}
            />
          </label>
          <button type="submit" className="secondary-button">
            {streamEnabled ? "Reconnect" : "Connect to updates"}
            <span aria-hidden="true">→</span>
          </button>
        </form>
        {streamError && <p className="error-message stream-error" role="alert">{streamError}</p>}
        <div className="event-list" aria-live="polite">
          {events.length === 0 ? (
            <p className="event-placeholder">
              {status === "connected"
                ? "Connected. Trip updates will appear here."
                : "Thoughts, itinerary drafts, and trip updates will appear here."}
            </p>
          ) : (
            [...events].reverse().map((event, index) => (
              <EventCard key={`${event.type}-${eventTime(event)}-${index}`} event={event} />
            ))
          )}
        </div>
      </section>

      <footer className="page-footer">
        <span>Made for the way you want to wander.</span>
        <span>ICEPOT <span className="brand-period">●</span> THOUGHTFUL TRAVEL, IN MOTION</span>
      </footer>
    </main>
  );
}

function ItineraryView({
  itinerary,
  onExportPdf,
  exportingPdf,
  pdfError
}: {
  itinerary: Itinerary;
  onExportPdf: () => void;
  exportingPdf: boolean;
  pdfError: string | null;
}) {
  return (
    <div className="itinerary-result">
      <div className="result-topline">
        <span className="result-pill"><span /> YOUR DRAFT IS READY</span>
        {itinerary.estimated_total_cost != null && (
          <span className="estimated-cost">
            ~${itinerary.estimated_total_cost.toLocaleString()} <small>estimated</small>
          </span>
        )}
      </div>
      <div className="eyebrow muted">A THOUGHTFUL ESCAPE</div>
      <h2>{itinerary.title}</h2>
      <p className="itinerary-summary">{itinerary.summary}</p>
      <button className="export-button" type="button" onClick={onExportPdf} disabled={exportingPdf}>
        {exportingPdf ? "Preparing PDF…" : "Download trip PDF"}
        <span aria-hidden="true">↓</span>
      </button>
      {pdfError && <p className="error-message" role="alert">{pdfError}</p>}
      <div className="day-list">
        {itinerary.days.map((day, index) => (
          <article className="day-card" key={`${day.date}-${index}`}>
            <div className="day-number">{String(index + 1).padStart(2, "0")}</div>
            <div className="day-content">
              <span className="day-date">{formatDate(day.date)}</span>
              <h3>{day.title}</h3>
              <ul>{day.activities.map((activity) => <li key={activity}>{activity}</li>)}</ul>
            </div>
          </article>
        ))}
      </div>
      <p className="draft-disclaimer">A first draft, not a booking. Dates and availability should be confirmed.</p>
    </div>
  );
}

function StreamBadge({ status }: { status: "idle" | "connecting" | "connected" | "error" }) {
  const labels = {
    idle: "NOT CONNECTED",
    connecting: "CONNECTING",
    connected: "LIVE",
    error: "CONNECTION ISSUE"
  };
  return <span className={`stream-badge ${status}`}><i />{labels[status]}</span>;
}

function EventCard({ event }: { event: TripEvent }) {
  if (event.type === "itinerary_draft") {
    return (
      <article className="event-card draft-event">
        <span className="event-symbol">✳</span>
        <div><span className="event-type">ITINERARY DRAFT</span><p>Your draft is ready to explore.</p></div>
        <strong>${event.totalCost.toLocaleString()}</strong>
      </article>
    );
  }
  if (event.type === "agent_error") {
    return (
      <article className="event-card error-event">
        <span className="event-symbol">!</span>
        <div><span className="event-type">{event.code}</span><p>{event.message}</p></div>
        <time>{formatTime(event.timestamp)}</time>
      </article>
    );
  }
  if (event.type === "disruption_alert") {
    return (
      <article className="event-card error-event">
        <span className="event-symbol">!</span>
        <div>
          <span className="event-type">FLIGHT {event.status}</span>
          <p>{event.message}</p>
        </div>
        <time>{formatTime(event.timestamp)}</time>
      </article>
    );
  }
  return (
    <article className="event-card">
      <span className="event-symbol">✳</span>
      <div><span className="event-type">{event.step.replaceAll("_", " ")}</span><p>{event.message}</p></div>
      <time>{formatTime(event.timestamp)}</time>
    </article>
  );
}

function parseItinerary(value: unknown): Itinerary {
  if (typeof value !== "object" || value === null) {
    throw new Error("The agent returned an invalid itinerary");
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.title !== "string" ||
    typeof candidate.summary !== "string" ||
    !Array.isArray(candidate.days) ||
    candidate.days.length === 0 ||
    !candidate.days.every(isItineraryDay)
  ) {
    throw new Error("The agent returned an incomplete itinerary");
  }
  if (
    candidate.estimated_total_cost !== undefined &&
    candidate.estimated_total_cost !== null &&
    (typeof candidate.estimated_total_cost !== "number" ||
      !Number.isFinite(candidate.estimated_total_cost) ||
      candidate.estimated_total_cost < 0)
  ) {
    throw new Error("The agent returned an invalid estimated cost");
  }
  return {
    title: candidate.title,
    summary: candidate.summary,
    days: candidate.days,
    estimated_total_cost:
      typeof candidate.estimated_total_cost === "number"
        ? candidate.estimated_total_cost
        : null
  };
}

function isItineraryDay(value: unknown): value is ItineraryDay {
  if (typeof value !== "object" || value === null) return false;
  const day = value as Record<string, unknown>;
  return (
    typeof day.date === "string" &&
    !Number.isNaN(Date.parse(`${day.date}T12:00:00`)) &&
    typeof day.title === "string" &&
    Array.isArray(day.activities) &&
    day.activities.length > 0 &&
    day.activities.every((activity) => typeof activity === "string")
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(new Date(`${value}T12:00:00`));
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function eventTime(event: TripEvent): string {
  return event.type === "itinerary_draft" ? event.tripId : event.timestamp;
}
