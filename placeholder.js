"use strict";

// ===============================================
// placeholder.js – Placeholder Detection Module
// ===============================================

// Utils: Escape RegExp special characters
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
}

// Global counter for placeholder IDs
let phIdCounter = 0;

// -----------------------------------------------
// Base class for detection strategies
// -----------------------------------------------
class DetectionStrategy {
  detect(text, mapping) {
    throw new Error("detect() not implemented");
  }
}

// -----------------------------------------------
// Regex-based detection strategy (fallback)
// -----------------------------------------------
class RegexDetectionStrategy extends DetectionStrategy {
  constructor({ regex, description, groupIndex = 0, rank = 1 }) {
    super();
    this.regex = regex;
    this.description = description;
    this.groupIndex = groupIndex;
    this.rank = rank;
  }

  detect(text, mapping) {
    const results = [];
    const re = new RegExp(this.regex.source, this.regex.flags);
    let m;
    while ((m = re.exec(text)) !== null) {
      const val = m[this.groupIndex] || m[0];
      if (!val) continue;
      if (mapping.some(e => e[1] === val && e[2] === this)) continue;
      const off = m[0].indexOf(val);
      const start = m.index + (off < 0 ? 0 : off);
      const end = start + val.length;
      results.push({ original: val, token: null, strategy: this, rank: this.rank, start, end });
    }
    return results;
  }
}

// -----------------------------------------------
// Generic placeholder type combining strategies
// -----------------------------------------------
class GenericPlaceholderType {
  constructor(prefix, strategies = []) {
    this.placeholderPrefix = prefix;
    this.detectionStrategies = strategies;
    this.rank = 1;
    this.enabled = true;
    this.id = `ph_${prefix}_${++phIdCounter}`;
  }

  getNextTokenName(mapping) {
    let token = `[${this.placeholderPrefix}]`;
    if (!mapping.some(e => e[1] === token)) return token;
    let cnt = 2;
    while (mapping.some(e => e[1] === `[${this.placeholderPrefix}_${cnt}]`)) cnt++;
    return `[${this.placeholderPrefix}_${cnt}]`;
  }

  detect(text, mapping) {
    let hits = [];
    for (const strat of this.detectionStrategies) {
      hits = hits.concat(strat.detect(text, mapping) || []);
    }
    return this._clean(hits);
  }

  _clean(matches) {
    const uniq = [];
    for (const m of matches) {
      if (!uniq.some(u => u.start === m.start && u.end === m.end)) uniq.push(m);
    }
    return uniq.filter(m =>
      !uniq.some(o => o !== m && o.start <= m.start && o.end >= m.end)
    );
  }
}

// -----------------------------------------------
// Custom placeholder type (literal or regex pattern)
// -----------------------------------------------
class CustomPlaceholderType extends GenericPlaceholderType {
  constructor(pattern, label) {
    let regex;
    const match = pattern.match(/^\/(.+)\/(\w*)$/);
    if (match) {
      let flags = match[2]; if (!flags.includes('g')) flags += 'g';
      regex = new RegExp(match[1], flags);
    } else {
      regex = new RegExp(escapeRegExp(pattern), 'g');
    }
    const strat = new RegexDetectionStrategy({ regex, description: `Custom: ${pattern}`, groupIndex: 0, rank: 1 });
    super(label, [strat]);
    this.isCustom = true;
  }
}

// -----------------------------------------------
// Number placeholder: detects digit sequences
// -----------------------------------------------
class NumberPlaceholder extends GenericPlaceholderType {
  constructor() {
    const regex = /(?<!\d)[1-9](?:[ .\-\\/]*\d){2,}(?!\d)/g;
    const strat = new RegexDetectionStrategy({ regex, description: 'Number', groupIndex: 0, rank: 1 });
    super('Number', [strat]);
  }
}

// -----------------------------------------------
// Email placeholder: detects email patterns
// -----------------------------------------------
class EmailPlaceholder extends GenericPlaceholderType {
  constructor() {
    const regex = /\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g;
    const strat = new RegexDetectionStrategy({ regex, description: 'Email', groupIndex: 0, rank: 1 });
    super('Email', [strat]);
  }
}

// ===============================================
// NamePlaceholder: prefix-based name detection
// ===============================================
class NamePlaceholder extends GenericPlaceholderType {
  // Default salutations/titles (case-insensitive)
  static DEFAULT_PREFIXES = [
    'Hallo','Hi','Hey',
    'Lieber','liebe',
    'Sehr geehrte','Sehr geehrter',
    'Guten Tag','Guten Morgen','Guten Abend',
    'Herr','Frau',
    'Prof\\.','Dr\\.','Ing\\.','med\\.',
    'PD','PD\\.'
  ];

  constructor(prefixList = NamePlaceholder.DEFAULT_PREFIXES) {
    super('Name', []);
    // escape and sort by length desc
    this.prefixes = [...prefixList].sort((a,b)=>b.length-a.length).map(s=>escapeRegExp(s));
    this.rank = 1;
  }

  detect(text, mapping) {
    const results = [];
    if (!this.prefixes.length) return results;

    const alt = this.prefixes.join('|');
    const prefixRe = new RegExp(`(?<!\\S)(?:${alt})(?!\\S)`, 'gi');
    let match;

    while ((match = prefixRe.exec(text)) !== null) {
      const endOfPrefix = match.index + match[0].length;
      const tail = text.slice(endOfPrefix);
      const nextRe = new RegExp(`^\\s*(?:${alt})(?!\\S)`, 'i');
      if (nextRe.test(tail)) continue;

      // match uppercase name OR two-word lowercase name
      const nameRe = new RegExp(
        `^\\s*([\\p{Lu}][\\p{L}]+(?:[ \\-][\\p{Lu}][\\p{L}]+){0,3})(?=[^\\p{L}]|$)`,
        'u'
      );
      const nm = tail.match(nameRe);
      if (!nm) continue;

      const original = nm[1];
      const leading = nm[0].length - original.length;
      const start = endOfPrefix + leading;
      const end = start + original.length;
      if (!mapping.some(e=>e[0]===original && e[2]===this)) {
        results.push({ original, token:null, strategy:this, rank:this.rank, start, end });
      }
    }

    return this._clean(results);
  }
}

// ===============================================
// Global exports
// ===============================================
window.escapeRegExp = escapeRegExp;
window.DetectionStrategy = DetectionStrategy;
window.RegexDetectionStrategy = RegexDetectionStrategy;
window.GenericPlaceholderType = GenericPlaceholderType;
window.CustomPlaceholderType = CustomPlaceholderType;
window.NumberPlaceholder = NumberPlaceholder;
window.EmailPlaceholder = EmailPlaceholder;
window.NamePlaceholder = NamePlaceholder;
