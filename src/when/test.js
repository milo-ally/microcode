import { parse } from './core.js';
import { formatDate } from './format.js';
import assert from 'node:assert';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL: ${name}`);
    console.log(`        ${err.message}`);
  }
}

function midnight(d) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

console.log('\nparse()\n-------');

test('"today" → today at 00:00', () => {
  const result = parse('today');
  const expected = midnight(new Date());
  assert.ok(result instanceof Date);
  assert.strictEqual(result.getTime(), expected.getTime());
});

test('"tomorrow" → tomorrow at 00:00', () => {
  const result = parse('tomorrow');
  const expected = new Date();
  expected.setDate(expected.getDate() + 1);
  assert.strictEqual(result.getTime(), midnight(expected).getTime());
});

test('"yesterday" → yesterday at 00:00', () => {
  const result = parse('yesterday');
  const expected = new Date();
  expected.setDate(expected.getDate() - 1);
  assert.strictEqual(result.getTime(), midnight(expected).getTime());
});

test('"next Monday" → next Monday (or today if Monday)', () => {
  const result = parse('next Monday');
  const now = new Date();
  const target = new Date(now);
  const diff = (1 - now.getDay() + 7) % 7 || 7;
  target.setDate(target.getDate() + diff);
  assert.strictEqual(result.getTime(), midnight(target).getTime());
});

test('"last Friday" → last Friday (or today if Friday)', () => {
  const result = parse('last Friday');
  const now = new Date();
  const target = new Date(now);
  let diff = now.getDay() - 5;
  if (diff <= 0) diff += 7;
  target.setDate(target.getDate() - diff);
  assert.strictEqual(result.getTime(), midnight(target).getTime());
});

test('"in 3 days" → 3 days from now at 00:00', () => {
  const result = parse('in 3 days');
  const expected = new Date();
  expected.setDate(expected.getDate() + 3);
  assert.strictEqual(result.getTime(), midnight(expected).getTime());
});

test('"2025-12-25" → Dec 25, 2025', () => {
  const result = parse('2025-12-25');
  assert.ok(result instanceof Date);
  assert.strictEqual(result.getFullYear(), 2025);
  assert.strictEqual(result.getMonth(), 11);
  assert.strictEqual(result.getDate(), 25);
});

test('"blah blah" → null', () => {
  const result = parse('blah blah');
  assert.strictEqual(result, null);
});

console.log('\nformatDate()\n------------');

test('ISO date → iso format', () => {
  const result = formatDate(new Date('2025-06-22'), 'iso');
  assert.strictEqual(result, '2025-06-22T00:00:00.000Z');
});

test('ISO date → readable format', () => {
  const result = formatDate(new Date('2025-06-22'), 'readable');
  assert.strictEqual(result, 'June 22, 2025');
});

test('ISO date → full format', () => {
  const result = formatDate(new Date('2025-06-22'), 'full');
  assert.strictEqual(result, 'Sunday, June 22, 2025');
});

test('null → "Invalid date"', () => {
  const result = formatDate(null, 'iso');
  assert.strictEqual(result, 'Invalid date');
});

console.log(`\n${passed} passed, ${failed} failed\n`);

process.exitCode = failed > 0 ? 1 : 0;
