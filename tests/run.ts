import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Hermetic test launcher.
 *
 * Every suite under `tests/` exercises the process-local adapters: it assumes no
 * database is configured and asserts the empty/in-memory behaviour that results.
 * Leaving that implicit meant the suites silently switched to the live Supabase
 * project as soon as a developer had a real `.env`, and wrote synthetic webhook
 * jobs into it. This launcher pins the database-related variables to obvious
 * placeholders *before* any application module (and therefore `dotenv`) loads, so
 * `tsx tests/run.ts tests/foo.test.ts` is always database-free.
 *
 * The values are set on `process.env` first, and `dotenv` never overrides an
 * already-defined variable, so the real `.env` is ignored for these keys only.
 * Every other variable (session secrets, rate limits, ...) still comes from
 * `.env` as usual.
 *
 * Tests that genuinely need the live project live in `tests/integration/` and are
 * run explicitly, never as part of `npm test`.
 */
const DATABASE_ISOLATION: Record<string, string> = {
  SUPABASE_URL: 'https://mock-project-id.supabase.co',
  SUPABASE_SECRET_KEY: 'test_supabase_secret_key_placeholder',
};

for (const [name, value] of Object.entries(DATABASE_ISOLATION)) {
  process.env[name] = value;
}

const specifier = process.argv[2];
if (!specifier) {
  console.error('usage: tsx tests/run.ts <test-file>');
  process.exit(2);
}

await import(pathToFileURL(path.resolve(specifier)).href);
