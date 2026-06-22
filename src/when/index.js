#!/usr/bin/env node

import { parse } from './core.js';
import { formatDate } from './format.js';

const args = process.argv.slice(2);
const query = args[0];

let format = 'iso';

if (args[1]) {
  if (args[1].startsWith('--format=')) {
    format = args[1].split('=')[1];
  } else if (args[1] === '--format' && args[2]) {
    format = args[2];
  }
}

function usage() {
  console.log(`Usage: when <query> [--format <format>]

Query examples:
  "next Monday"
  "tomorrow"
  "in 3 days"

Format options:
  iso       ISO 8601 format (default)
  readable  e.g. June 22, 2025
  full      e.g. Sunday, June 22, 2025`);
}

if (!query) {
  usage();
  process.exit(1);
}

const parsed = parse(query);

if (parsed === null) {
  console.error('Could not parse query:', query);
  process.exit(1);
}

console.log(parsed.display);
console.log(formatDate(parsed.date, format));
