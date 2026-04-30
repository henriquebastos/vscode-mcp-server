#!/usr/bin/env node
// Sanitize c8/v8-to-istanbul output for fallow consumption.
//
// vscode-test pipes V8 coverage through c8/v8-to-istanbul, which emits a
// `coverage-final.json` containing `-1` sentinel values in branch-position
// columns. fallow's Istanbul parser is strict and rejects negative u32 fields,
// so we clamp those negatives to 0 in place. Only `column` and `line` numeric
// fields can be negative in c8 output, and clamping them only affects
// branch-position metadata that fallow does not consume for per-function
// CRAP scoring.
import { readFileSync, writeFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

const path = argv[2] ?? 'coverage/coverage-final.json';

let raw;
try {
    raw = readFileSync(path, 'utf8');
} catch (error) {
    console.error(`[sanitize-coverage] Cannot read ${path}: ${error.message}`);
    exit(1);
}

const data = JSON.parse(raw);
let clamped = 0;

const POSITION_FIELDS = new Set(['line', 'column']);

const isPositionField = (key, value) =>
    POSITION_FIELDS.has(key) && typeof value === 'number' && value < 0;

const clampNegatives = (node) => {
    if (Array.isArray(node)) {
        node.forEach(clampNegatives);
        return;
    }
    if (node === null || typeof node !== 'object') {
        return;
    }
    for (const [key, value] of Object.entries(node)) {
        if (isPositionField(key, value)) {
            node[key] = 0;
            clamped += 1;
        } else {
            clampNegatives(value);
        }
    }
};

clampNegatives(data);
writeFileSync(path, JSON.stringify(data));
console.log(`[sanitize-coverage] Clamped ${clamped} negative line/column values in ${path}`);
