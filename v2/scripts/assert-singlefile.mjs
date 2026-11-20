import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const output = join('dist', 'index.html');
const html = readFileSync(output, 'utf8');
const files = readdirSync('dist');
const invalid = [
  /<script\b[^>]*\bsrc\s*=/i,
  /<link\b[^>]*rel=["']?stylesheet["']?[^>]*\bhref\s*=/i,
  /<(?:script|link|img)\b[^>]*(?:src|href)\s*=\s*["']https?:\/\//i
];
if (files.length !== 1 || files[0] !== 'index.html') {
  throw new Error('Expected exactly one dist/index.html file, found: ' + files.join(', '));
}
if (!/<script\b/i.test(html) || !/<style\b/i.test(html) || invalid.some(rule => rule.test(html))) {
  throw new Error('Output is not a self-contained HTML document.');
}
console.log('Single-file verified: dist/index.html (' + Math.round(Buffer.byteLength(html) / 1024) + ' KiB)');
