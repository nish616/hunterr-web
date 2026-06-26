import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { Tier } from "@/lib/constants";

/**
 * Route-handler tests for the auto-run cron.
 *
 * We mock the I/O boundaries — DB, the hunt pipeline, Resend, and the email
 * component — but use the REAL pure helpers (isAlertDue, diffNewJobs) so the
 * window/interval logic is exercised end-to-end. `vi.setSystemTime` controls
 * "now" so the alert-window decisions are deterministic.
 *
 * Mock fns are prefixed with `mock` so vitest's vi.mock hoisting allows the
 * factories to reference them.
 */

const mockFindMany = vi.fn();
const mockRunHunt = vi.fn();
const mockSend = vi.fn();

vi.mock("@/lib/db", () => ({
  db: { query: { users: { findMany: (...a: unknown[]) => mockFindMany(...a) } } },
  schema: {},
}));

vi.mock("@/lib/hunt/pipeline", () => ({
  runHunt: (...a: unknown[]) => mockRunHunt(...a),
}));

vi.mock("@/lib/resend", () => ({
  getResendClient: () => ({ emails: { send: (...a: unknown[]) => mockSend(...a) } }),
}));

vi.mock("@/components/emails/jobAlertEmail", () => ({
  // Return a marker object instead of a real React element so we don't pull
  // @react-email/components into the node test environment.
  JobAlertEmail: (props: unknown) => ({ __email: true, props }),
}));

// Import AFTER the mocks are declared (vi.mock is hoisted, so this is safe).
import { GET } from "./route";

// ---- fixtures --------------------------------------------------------------

const SECRET = "test-cron-secret";

// 2026-06-23T08:00:00Z → 13:30 IST → hour 13 → inside a 9–21 IST window.
const INSIDE_WINDOW = new Date("2026-06-23T08:00:00Z");
// 2026-06-23T23:00:00Z → 04:30 IST → hour 4 → outside a 9–21 window.
const OUTSIDE_WINDOW = new Date("2026-06-23T23:00:00Z");

const SAMPLE_JOB = {
  title: "Senior Engineer",
  company: "Acme",
  location: "Bengaluru",
  postedAt: "2026-06-23",
  url: "https://example.com/job/1",
};

type UserRow = {
  id: string;
  email: string;
  subscription?: { tier: Tier } | null;
  preferences?: Record<string, unknown> | null;
};

function proUser(over: Partial<UserRow> = {}): UserRow {
  return {
    id: "u1",
    email: "u1@example.com",
    subscription: { tier: Tier.Pro },
    preferences: {
      autoRunEnabled: true,
      preferredTitles: "engineer",
      skills: "react",
    },
    ...over,
  };
}

function makeReq(secret?: string): Request {
  const headers: Record<string, string> = {};
  if (secret !== undefined) headers["Authorization"] = `Bearer ${secret}`;
  return new Request("https://app.test/api/cron/auto-run", { headers });
}

// ---- setup -----------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  // Default every test to "inside window" unless it overrides.
  vi.useFakeTimers();
  vi.setSystemTime(INSIDE_WINDOW);
  // Sensible defaults — individual tests override as needed.
  mockFindMany.mockResolvedValue([]);
  mockRunHunt.mockResolvedValue({ jobs: [SAMPLE_JOB], stats: {} });
  mockSend.mockResolvedValue({ data: { id: "email_1" }, error: null });
});

afterEach(() => {
  vi.useRealTimers();
});

// ---- auth ------------------------------------------------------------------

describe("auth", () => {
  it("returns 500 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeReq(SECRET));
    expect(res.status).toBe(500);
  });

  it("returns 401 when the bearer token is missing", async () => {
    const res = await GET(makeReq(undefined));
    expect(res.status).toBe(401);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("returns 401 when the bearer token is wrong", async () => {
    const res = await GET(makeReq("wrong-secret"));
    expect(res.status).toBe(401);
    expect(mockRunHunt).not.toHaveBeenCalled();
  });

  it("proceeds when the bearer token matches", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await GET(makeReq(SECRET));
    expect(res.status).toBe(200);
  });
});

// ---- eligibility -----------------------------------------------------------

describe("eligibility filtering", () => {
  it("excludes free-tier users", async () => {
    mockFindMany.mockResolvedValue([
      proUser({ id: "free", subscription: { tier: Tier.Free } }),
    ]);
    const res = await GET(makeReq(SECRET));
    const body = await res.json();
    expect(body.eligibleUsers).toBe(0);
    expect(mockRunHunt).not.toHaveBeenCalled();
  });

  it("excludes users with subscription missing entirely", async () => {
    mockFindMany.mockResolvedValue([proUser({ subscription: null })]);
    const res = await GET(makeReq(SECRET));
    const body = await res.json();
    expect(body.eligibleUsers).toBe(0);
  });

  it("excludes users without autoRunEnabled", async () => {
    mockFindMany.mockResolvedValue([
      proUser({ preferences: { autoRunEnabled: false } }),
    ]);
    const res = await GET(makeReq(SECRET));
    const body = await res.json();
    expect(body.eligibleUsers).toBe(0);
  });

  it("includes Pro users with autoRunEnabled", async () => {
    mockFindMany.mockResolvedValue([proUser()]);
    const res = await GET(makeReq(SECRET));
    const body = await res.json();
    expect(body.eligibleUsers).toBe(1);
    expect(mockRunHunt).toHaveBeenCalledTimes(1);
  });

  it("caps processing at MAX_USERS_PER_TICK (10)", async () => {
    const many = Array.from({ length: 13 }, (_, i) =>
      proUser({ id: `u${i}`, email: `u${i}@example.com` }),
    );
    mockFindMany.mockResolvedValue(many);
    const res = await GET(makeReq(SECRET));
    const body = await res.json();
    expect(body.eligibleUsers).toBe(10);
    expect(mockRunHunt).toHaveBeenCalledTimes(10);
  });
});

// ---- hunt invocation -------------------------------------------------------

describe("hunt invocation", () => {
  it("always runs hunts with AI scoring OFF (cost guarantee)", async () => {
    mockFindMany.mockResolvedValue([proUser()]);
    await GET(makeReq(SECRET));
    expect(mockRunHunt).toHaveBeenCalledWith(
      expect.objectContaining({ withAi: false }),
    );
  });

  it("passes the user's titles and skills as filters", async () => {
    mockFindMany.mockResolvedValue([
      proUser({
        preferences: {
          autoRunEnabled: true,
          preferredTitles: "backend, platform",
          skills: "go, kubernetes",
        },
      }),
    ]);
    await GET(makeReq(SECRET));
    expect(mockRunHunt).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          roles: ["backend", "platform"],
          skills: ["go", "kubernetes"],
        }),
      }),
    );
  });

  it("skips the hunt and flags users missing titles or skills", async () => {
    mockFindMany.mockResolvedValue([
      proUser({ preferences: { autoRunEnabled: true, skills: "react" } }), // no titles
    ]);
    const res = await GET(makeReq(SECRET));
    const body = await res.json();
    expect(mockRunHunt).not.toHaveBeenCalled();
    expect(body.alerts[0].wouldAlert).toBe(false);
    expect(body.alerts[0].reason).toMatch(/missing titles or skills/);
  });
});

// ---- alert decision --------------------------------------------------------

describe("alert decision", () => {
  it("flags wouldAlert=true inside the window with jobs and no prior alert", async () => {
    vi.setSystemTime(INSIDE_WINDOW);
    mockFindMany.mockResolvedValue([proUser()]);
    const res = await GET(makeReq(SECRET));
    const body = await res.json();
    expect(body.alerts[0].wouldAlert).toBe(true);
    expect(body.alerts[0].reason).toMatch(/new job/);
    expect(body.wouldAlert).toBe(1);
  });

  it("flags wouldAlert=false outside the window even with jobs", async () => {
    vi.setSystemTime(OUTSIDE_WINDOW);
    mockFindMany.mockResolvedValue([proUser()]);
    const res = await GET(makeReq(SECRET));
    const body = await res.json();
    expect(body.alerts[0].wouldAlert).toBe(false);
    expect(body.alerts[0].reason).toMatch(/outside window|interval/);
  });

  it("flags wouldAlert=false when the hunt returns zero jobs", async () => {
    mockRunHunt.mockResolvedValue({ jobs: [], stats: {} });
    mockFindMany.mockResolvedValue([proUser()]);
    const res = await GET(makeReq(SECRET));
    const body = await res.json();
    expect(body.alerts[0].wouldAlert).toBe(false);
    expect(body.alerts[0].reason).toMatch(/no new jobs/);
  });

  it("flags wouldAlert=false inside window when the interval has not elapsed", async () => {
    vi.setSystemTime(INSIDE_WINDOW);
    // last alert 1 hour ago, frequency 4h → not elapsed
    const oneHourAgo = new Date(
      INSIDE_WINDOW.getTime() - 60 * 60 * 1000,
    ).toISOString();
    mockFindMany.mockResolvedValue([
      proUser({
        preferences: {
          autoRunEnabled: true,
          preferredTitles: "engineer",
          skills: "react",
          alertFrequencyHours: 4,
          lastAlertSentAt: oneHourAgo,
        },
      }),
    ]);
    const res = await GET(makeReq(SECRET));
    const body = await res.json();
    expect(body.alerts[0].wouldAlert).toBe(false);
  });
});

// ---- error handling --------------------------------------------------------

describe("error handling", () => {
  it("captures a hunt failure per-user without failing the whole tick", async () => {
    mockRunHunt.mockRejectedValue(new Error("ATS timeout"));
    mockFindMany.mockResolvedValue([proUser()]);
    const res = await GET(makeReq(SECRET));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].error).toMatch(/ATS timeout/);
  });

  it("isolates one user's failure from another user's success", async () => {
    mockRunHunt
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ jobs: [SAMPLE_JOB], stats: {} });
    mockFindMany.mockResolvedValue([
      proUser({ id: "bad", email: "bad@example.com" }),
      proUser({ id: "good", email: "good@example.com" }),
    ]);
    const res = await GET(makeReq(SECRET));
    const body = await res.json();
    expect(body.errors).toHaveLength(1);
    expect(body.alerts).toHaveLength(1);
  });
});

// ---- email sending ---------------------------------------------------------

describe("email sending", () => {
  it("sends an email to a user who has matching jobs", async () => {
    vi.setSystemTime(INSIDE_WINDOW);
    mockFindMany.mockResolvedValue([proUser()]);
    await GET(makeReq(SECRET));
    expect(mockSend).toHaveBeenCalledTimes(1);
    const arg = mockSend.mock.calls[0][0];
    expect(arg.to).toBe("u1@example.com");
    expect(arg.subject).toMatch(/Job Alert/);
    expect(arg.react).toBeTruthy();
  });

  it("does NOT send an email when the hunt returns zero jobs", async () => {
    mockRunHunt.mockResolvedValue({ jobs: [], stats: {} });
    mockFindMany.mockResolvedValue([proUser()]);
    await GET(makeReq(SECRET));
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("passes the mapped jobs (with url) to the email component", async () => {
    vi.setSystemTime(INSIDE_WINDOW);
    mockFindMany.mockResolvedValue([proUser()]);
    await GET(makeReq(SECRET));
    const arg = mockSend.mock.calls[0][0];
    // Our JobAlertEmail mock returns { __email, props: { jobs } }.
    expect(arg.react.props.jobs[0]).toMatchObject({
      title: "Senior Engineer",
      url: "https://example.com/job/1",
    });
  });
});
