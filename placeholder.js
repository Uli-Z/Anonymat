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
// NamePlaceholder: prefix-based name detection with nobiliary particles support
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

  // Nobilary particles to allow as name segments
  static NOBILIARY_PARTICLES = [
    // Deutsch
    'von', 'zu',

    // Niederländisch / Flämisch
    'van', 'van der', 'van den', 'van de',

    // Französisch
    'de', 'du', 'de la', 'des', "d'",

    // Italienisch
    'di', 'da', 'del', "della", "dell'", 'degli', 'dei',

    // Spanisch / Portugiesisch
    'de', 'de la', 'de las', 'de los', 'dos', 'das',

    // Weitere
    'le', 'la', 'ter', 'den', 'der', 'z', 'o’'
  ];

  constructor(prefixList = NamePlaceholder.DEFAULT_PREFIXES) {
    super('Name', []);
    this.prefixes = prefixList
      .slice()
      .sort((a, b) => b.length - a.length)
      .map(s => escapeRegExp(s));
    this.rank = 1;
  }

  detect(text, mapping) {
    const results = [];
    if (!this.prefixes.length) return results;

    // Build alternation of prefixes
    const alt = this.prefixes.join('|');
    // Regex to capture one or more prefix tokens in sequence
    const prefixSeqRe = new RegExp(`(?<!\\S)(?:${alt})(?:\\s+(?:${alt}))*`, 'gi');
    let match;

    // Build patterns for name segments (names or particles)
    const parts = NamePlaceholder.NOBILIARY_PARTICLES
      .slice()
      .sort((a, b) => b.length - a.length)
      .map(p => escapeRegExp(p));
    const partPattern = `(?:${parts.join('|')})`;
    const namePattern = `(?:[\\p{Lu}][\\p{L}]+)`;
    const segmentPattern = `(?:${namePattern}|${partPattern})`;

    while ((match = prefixSeqRe.exec(text)) !== null) {
      // match[0] may contain multiple prefixes
      const prefixText = match[0];
      let end = match.index + prefixText.length;
      let tail = text.slice(end);

      // Now capture the name segments after the prefix sequence
      const nameRe = new RegExp(
        `^\\s*${segmentPattern}(?:[ \\u00AD-]${segmentPattern}){0,4}(?=[^\\p{L}]|$)`,
        'u'
      );
      const m = tail.match(nameRe);
      if (!m) continue;

      // Full original string includes prefix sequence + name part
      const orig = m[0].trim();
      // Calculate start position of the name part
      const start = end + m[0].search(/[\\p{Lu}]/u);
      const final = start + orig.length;
      if (!mapping.some(e => e[0] === orig && e[2] === this)) {
        results.push({ original: orig, token: null, strategy: this, rank: this.rank, start, end: final });
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
