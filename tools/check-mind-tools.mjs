// Checks the mind function's tool definitions before they ship (CI runs it; `npm test` too).
// Both outages of the minds came from a tool schema the API refused, which only showed once every wake failed:
// session 9 (maxItems / minimum in strict schemas) and session 12 (sixteen strict schemas: "compiled grammar is too
// large"). This reads the tool lists out of supabase/functions/mind/index.ts, evaluates them (they only use the
// shared enum lists E) and fails on anything the API would refuse or that would quietly break a wake.
// Usage: node tools/check-mind-tools.mjs
import fs from 'node:fs';

const FILE = new URL('../supabase/functions/mind/index.ts', import.meta.url);
const src = fs.readFileSync(FILE, 'utf8');

/** The source of `const <name> ... = <open> ... <close>;` at the top level, with its TypeScript annotation dropped. */
function block(name, open, close) {
  const start = src.search(new RegExp(`^const ${name}\\b`, 'm'));
  if (start < 0) throw new Error(`const ${name} not found in index.ts`);
  const end = src.indexOf(`\n${close};`, start);
  if (end < 0) throw new Error(`end of ${name} not found`);
  const text = src.slice(start, end + close.length + 2);
  return text.replace(new RegExp(`^const ${name}[^=]*=\\s*\\${open}`), `const ${name} = ${open}`);
}

const code = [block('E', '{', '}'), block('tools', '[', ']'), block('longTools', '[', ']'), 'return { tools, longTools };'].join('\n');
const { tools, longTools } = new Function(code)();

// keywords the API refuses in strict schemas; they are fine while no tool is strict, but a tool turned strict
// again must not carry them (that was session 9)
const STRICT_ONLY_BAD = ['maxItems', 'minItems', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'pattern', 'format'];
const TYPES = ['object', 'string', 'integer', 'number', 'boolean', 'array'];

const errors = [];
const fail = (tool, msg) => errors.push(`${tool}: ${msg}`);

function walk(tool, schema, path, strict) {
  if (!schema || typeof schema !== 'object') return fail(tool, `${path} is not a schema`);
  if (!TYPES.includes(schema.type)) fail(tool, `${path} has type ${JSON.stringify(schema.type)}`);
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || !schema.enum.length || schema.enum.some((v) => v === undefined)))
    fail(tool, `${path} has an empty or broken enum (a missing list in E?)`);
  if (strict) for (const k of STRICT_ONLY_BAD) if (k in schema) fail(tool, `${path} uses ${k}, which strict tools may not`);
  if (schema.type === 'object') {
    const props = schema.properties ?? {};
    for (const r of schema.required ?? []) if (!(r in props)) fail(tool, `${path} requires "${r}" but has no such property`);
    if (strict && schema.additionalProperties !== false) fail(tool, `${path} must set additionalProperties: false when strict`);
    for (const [k, v] of Object.entries(props)) walk(tool, v, `${path}.${k}`, strict);
  }
  if (schema.type === 'array') walk(tool, schema.items, `${path}[]`, strict);
}

const all = [...tools, ...longTools];
const names = new Set();
for (const t of all) {
  const n = t?.name ?? '(no name)';
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(n)) fail(n, 'name must be lower_snake_case');
  if (names.has(n)) fail(n, 'defined twice');
  names.add(n);
  if (typeof t.description !== 'string' || t.description.length < 10) fail(n, 'needs a description');
  if (t.input_schema?.type !== 'object') fail(n, 'input_schema must be an object schema');
  // strict tools compile into one grammar; sixteen of them were too large (session 12). Keep them all non-strict.
  if ('strict' in t) fail(n, 'is marked strict: keep every mind tool non-strict (see the comment above E in index.ts)');
  walk(n, t.input_schema, 'input_schema', !!t.strict);
}
// every tool the code dispatches on must exist, and the other way round
const handled = new Set([...src.matchAll(/\.name === "([a-z_]+)"/g)].map((m) => m[1]));
for (const n of names) if (!handled.has(n)) fail(n, `is offered to the model but nothing handles it (no u.name === "${n}")`);

console.log(`mind tools: ${tools.length} in every wake, ${longTools.length} more in long wakes`);
if (errors.length) {
  for (const e of errors) console.error('  FAIL', e);
  process.exit(1);
}
console.log('ok');
