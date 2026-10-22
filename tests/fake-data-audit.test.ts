/**
 * Sections 21 and 22: fake data and fake expert audits.
 *
 * These are enforced as tests rather than left to a one-off search, because the
 * failure mode is a later edit that quietly reintroduces fabricated geology. A
 * manual audit passes once and then silently stops being true.
 *
 * What is being prohibited is not the word "fake" appearing in the repository.
 * Test fixtures legitimately contain synthetic specimens, and several source
 * comments describe the policy in prose. What is prohibited is synthetic
 * geological data or a fabricated person being reachable as production data.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const SEARCH_ROOTS = ['src', 'web/src', 'supabase/migrations'];
const EXTENSIONS = ['.ts', '.tsx', '.js', '.sql'];

let passed = 0;
let failed = 0;
let currentSection = '';

function section(title: string): void {
  currentSection = title;
  console.log('\n' + '-'.repeat(78));
  console.log(title);
  console.log('-'.repeat(78));
}

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (err: unknown) {
    failed += 1;
    console.log(`FAIL  ${name}`);
    console.log(`      ${err instanceof Error ? err.message : String(err)}`);
  }
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXTENSIONS.some((ext) => entry.endsWith(ext))) out.push(full);
  }
  return out;
}

interface Hit {
  file: string;
  line: number;
  text: string;
}

function scanProductionFiles(pattern: RegExp): Hit[] {
  const hits: Hit[] = [];
  for (const root of SEARCH_ROOTS) {
    for (const file of walk(join(ROOT, root))) {
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((raw, index) => {
        const line = raw.trim();
        if (!line) return;
        if (!pattern.test(raw)) return;
        // Comments document the policy; they cannot fabricate anything.
        if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*') || line.startsWith('--')) return;
        // A key inside a type or object literal still declares data, so it is kept.
        hits.push({
          file: relative(ROOT, file).replace(/\\/g, '/'),
          line: index + 1,
          text: line.slice(0, 160),
        });
      });
    }
  }
  return hits;
}

function describeHits(hits: Hit[]): string {
  return hits.map((h) => `  ${h.file}:${h.line}  ${h.text}`).join('\n');
}

/**
 * A geological observation is fabricated if it names a specific rock formation,
 * mineral species, or place and is reachable without a database. This looks for
 * the identifiers that make a record look like a real specimen.
 */
const FABRICATED_SPECIMEN_MARKERS =
  /\b(granite sample|sandstone sample|gneiss sample|basalt sample|quartzite sample|specimen #\d|test observation|example geology|dummy (rock|geolog|site|observation)|lorem ipsum)\b/i;

// -----------------------------------------------------------------------------
section('21. Fake data audit');
// -----------------------------------------------------------------------------

await test('no production file fabricates a geological observation', () => {
  const hits = scanProductionFiles(FABRICATED_SPECIMEN_MARKERS);
  assert.equal(
    hits.length,
    0,
    `production source fabricates specimen data:\n${describeHits(hits)}`
  );
});

await test('no production collection is initialised with content', () => {
  // Every in-memory store must start empty. A store seeded at construction time
  // serves invented records to the first visitor of a fresh deployment.
  const files = [
    'src/repositories/community.repository.ts',
    'src/repositories/expert.repository.ts',
    'src/repositories/public-observation.repository.ts',
    'src/repositories/site.repository.ts',
    'src/repositories/validation.repository.ts',
  ];

  for (const file of files) {
    const source = readFileSync(join(ROOT, file), 'utf8');
    const seeded = source.match(
      /^\s*(?:private|public|protected|const)\s+\w*(?:store|observations|records|rows|entries|items|cache|samples|datasets|images|runs|predictions|errors)\w*\s*(?::[^=]+)?=\s*\[(?!\s*\])/gim
    );
    assert.equal(
      seeded,
      null,
      `${file} initialises a store with content:\n${(seeded ?? []).join('\n')}\nA fresh deployment would serve these records as if they were collected.`
    );
  }
});

await test('the development fallbacks in env.ts are placeholders, not data', () => {
  const source = readFileSync(join(ROOT, 'src/config/env.ts'), 'utf8');
  const fallbacks = source.match(/devSecretFallbacks: Record<string, string> = \{[\s\S]*?\n\};/)?.[0] ?? '';
  assert.ok(fallbacks, 'the development fallback block was not found');

  // Every fallback must be obviously unconfigured. A plausible-looking default
  // API key or URL is how mock data reaches production. The accepted shapes are
  // the explicit "not configured" sentinel, a named placeholder host, and a
  // structurally invalid zero identifier.
  const values = [...fallbacks.matchAll(/:\s*'([^']*)'/g)].map((m) => m[1]);
  assert.ok(values.length > 0, 'the fallback block is empty');
  for (const value of values) {
    assert.ok(
      value === '' ||
        /not_configured/.test(value) ||
        /mock-project-id|placeholder|test_|changeme|replace_me/.test(value) ||
        /^0+$/.test(value) ||
        /^dev_/.test(value),
      `env.ts fallback value '${value}' looks like a real credential or identifier; an unconfigured value must be obviously a placeholder`
    );
  }
});

await test('development fallbacks are refused in production', () => {
  const source = readFileSync(join(ROOT, 'src/config/env.ts'), 'utf8');
  const block = source.match(/function validateEnv\(\): EnvConfig \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(block, /NODE_ENV === 'production'/, 'the environment validator no longer distinguishes production');
  assert.match(block, /throw|missing/i, 'a production run with placeholder credentials is not rejected');
});

await test('placeholder credentials are detected as unconfigured', () => {
  const source = readFileSync(join(ROOT, 'src/config/env.ts'), 'utf8');
  for (const marker of ['mock-project-id', 'placeholder', 'test_', 'changeme', 'replace_me']) {
    assert.ok(
      source.includes(marker),
      `env.ts no longer treats '${marker}' as an unconfigured value, so a copied .env.example would appear to be a working deployment`
    );
  }
});

await test('a repository that cannot reach the database yields an empty result, not invented records', () => {
  // These repositories are the read path for the map, the site explorer and the
  // public API. When Supabase is unreachable they must return nothing.
  for (const file of [
    'src/repositories/public-observation.repository.ts',
    'src/repositories/community.repository.ts',
    'src/repositories/site.repository.ts',
  ]) {
    const source = readFileSync(join(ROOT, file), 'utf8');
    assert.ok(
      /NO (synthetic|seed)/i.test(source) || /REAL DATA POLICY/i.test(source),
      `${file} does not document that its empty read is deliberate`
    );
  }
});

// -----------------------------------------------------------------------------
section('22. Fake expert audit');
// -----------------------------------------------------------------------------

await test('no expert is hard-coded as an authorised identity', () => {
  const source = readFileSync(join(ROOT, 'src/utils/expert-auth.ts'), 'utf8');
  const match = source.match(/AUTHORIZED_EXPERTS[^=]*=\s*\[([^\]]*)\]/);
  assert.ok(match, 'AUTHORIZED_EXPERTS is no longer an explicitly empty list');

  const contents = match[1].trim();
  assert.equal(
    contents,
    '',
    `AUTHORIZED_EXPERTS contains ${contents}. Any entry names a real person who never agreed to be listed or to have their judgement published.`
  );
});

await test('no production file names a person with an academic or professional title', () => {
  // Titles appear in a scientific register: "Dr ...", "Prof ...", "PhD". Used as
  // data they fabricate a credential for someone who may not exist.
  const hits = scanProductionFiles(/\b(Dr\.|Prof\.|PhD|Ph\.D|M\.Sc)\s+[A-Z][a-z]+/);
  assert.equal(
    hits.length,
    0,
    `production source names a credentialed person:\n${describeHits(hits)}`
  );
});

await test('no production file attributes a review to an institutional expert', () => {
  const hits = scanProductionFiles(
    /\b(reviewed by|verified by|approved by|assessed by)\s+[A-Z]/
  );
  assert.equal(
    hits.length,
    0,
    `production source attributes a decision to a named person:\n${describeHits(hits)}`
  );
});

await test('reviewer identity is published only when the record allows it', () => {
  const service = readFileSync(join(ROOT, 'src/services/community.service.ts'), 'utf8');
  assert.ok(
    /identity_published \? .*reviewer_name : ['"]Expert reviewed['"]/.test(service),
    'a reviewer name is published unconditionally; a named attribution must require an explicit decision to publish'
  );
});

await test('the expert login surface offers no preset account', () => {
  const source = readFileSync(join(ROOT, 'web/src/components/GeneralLoginModal.tsx'), 'utf8');
  // A list of one-click accounts bypasses authentication entirely.
  assert.ok(
    !/(quickLogin|presetAccount|demoAccounts|ONE_CLICK)/i.test(source),
    'GeneralLoginModal exposes a preset account list'
  );
  assert.ok(
    /administrator email|administrator password/i.test(source),
    'GeneralLoginModal no longer prompts for real credentials'
  );
});

await test('synthetic expert data lives only in test fixtures', () => {
  // Any file that fabricates a reviewer must live under tests/.
  const files = [
    ...walk(join(ROOT, 'src')),
    ...walk(join(ROOT, 'web/src')),
    ...walk(join(ROOT, 'supabase/migrations')),
  ];

  const offenders: string[] = [];
  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    if (rel.startsWith('tests/')) continue;
    const source = readFileSync(file, 'utf8');
    if (/reviewer_name:\s*['"][^'"]{2,}['"]/.test(source) || /expert_name:\s*['"][^'"]{2,}['"]/.test(source)) {
      offenders.push(rel);
    }
  }
  assert.equal(
    offenders.length,
    0,
    `expert names are hard-coded outside test fixtures:\n${offenders.map((o) => `  ${o}`).join('\n')}`
  );
});

// -----------------------------------------------------------------------------
console.log('\n' + '='.repeat(78));
console.log(`${passed} passed, ${failed} failed`);
console.log('='.repeat(78));
if (failed > 0) process.exitCode = 1;