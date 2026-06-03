/**
 * Vitest setup. Runs once before any test module is imported.
 *
 * Several files in src/ throw at module-init if their env vars are
 * missing (src/lib/db/index.ts requires DATABASE_URL, auth.ts uses
 * AUTH_SECRET, etc.). Tests for pure helpers shouldn't have to spin
 * up Postgres — we just need the env vars to be *present* so the
 * top-level checks pass. The dummy values are never used because no
 * test in this suite calls into the DB or the Anthropic SDK.
 */
process.env.DATABASE_URL ??=
  "postgresql://test:test@localhost:5432/test";
process.env.AUTH_SECRET ??= "test-only-not-a-real-secret";
process.env.ANTHROPIC_API_KEY ??= "sk-ant-test-not-real";
