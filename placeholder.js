"use strict";

// Helper to escape regex special characters.
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Global counter for generating unique placeholder IDs
let phIdCounter = 0;

/* Base class for detection strategies */
class DetectionStrategy {
  detect(text, currentMapping) {
    throw new Error("detect() not implemented");
  }
}

/* Regex detection strategy with optional prefixes and suffixes */
class RegexDetectionStrategy extends DetectionStrategy {
  constructor(options) {
    super();
    this.description = options.description;
    this.groupIndex = options.groupIndex ?? 0;
    this.rank = options.rank ?? 1;
    this.regex = options.regex;
  }

  detect(text, currentMapping) {
    const results = [];
    const regex = new RegExp(this.regex.source, this.regex.flags);
    let m;
    while ((m = regex.exec(text)) !== null) {
      const detectedValue = m[this.groupIndex] ?? m[0];
      if (!detectedValue) continue;
      if (currentMapping.some(e => e[1] === detectedValue && e[2] === this)) continue;
      const offset = m[0].indexOf(detectedValue);
      const start = m.index + (offset < 0 ? 0 : offset);
      const end = start + detectedValue.length;
      results.push({
        original: detectedValue,
        token: null,
        strategy: this,
        rank: this.rank,
        start,
        end
      });
    }
    return results;
  }
}

/* Generic placeholder type that aggregates detection strategies */
class GenericPlaceholderType {
  constructor(placeholderPrefix, detectionStrategies = []) {
    this.placeholderPrefix = placeholderPrefix;
    this.detectionStrategies = detectionStrategies;
    this.rank = 1;
    this.enabled = true;
    this.id = "ph_" + placeholderPrefix + "_" + (++phIdCounter);
  }

  getNextTokenName(currentMapping) {
    let token = `[${this.placeholderPrefix}]`;
    if (!currentMapping.some(e => e[1] === token)) return token;
    let counter = 2;
    token = `[${this.placeholderPrefix}_${counter}]`;
    while (currentMapping.some(e => e[1] === token)) {
      counter++;
      token = `[${this.placeholderPrefix}_${counter}]`;
    }
    return token;
  }

  detect(text, currentMapping) {
    let results = [];
    for (const strat of this.detectionStrategies) {
      results = results.concat(strat.detect(text, currentMapping));
    }
    return this.cleanMatches(results);
  }

  cleanMatches(matches) {
    const unique = [];
    for (const m of matches) {
      if (!unique.some(u => u.start === m.start && u.end === m.end)) unique.push(m);
    }
    return unique.filter(m =>
      !unique.some(o => o !== m && o.start <= m.start && o.end >= m.end)
    );
  }
}

/* CustomPlaceholderType – supports literal regex syntax "/pattern/flags" */
class CustomPlaceholderType extends GenericPlaceholderType {
  constructor(pattern, placeholderPrefix) {
    let regex;
    const slashRe = /^\/(.+)\/([gimsuy]*)$/;
    const match = pattern.match(slashRe);
    if (match) {
      const body = match[1];
      let flags = match[2] || "";
      if (!flags.includes("g")) flags += "g";
      regex = new RegExp(body, flags);
    } else {
      regex = new RegExp(escapeRegExp(pattern), "g");
    }
    const strategy = new RegexDetectionStrategy({
      regex,
      description: `Custom placeholder: ${pattern}`,
      groupIndex: 0,
      rank: 1
    });
    super(placeholderPrefix, [strategy]);
    this.pattern = pattern;
    this.isCustom = true;
  }
}

/* NumberPlaceholder */
class NumberPlaceholder extends GenericPlaceholderType {
  constructor() {
    const numberRegex = /(?<!\d)[1-9](?:[ .\-\/\\]*\d){2,}(?!\d)/g;
    const strategy = new RegexDetectionStrategy({
      regex: numberRegex,
      description: "Number detection",
      groupIndex: 0,
      rank: 1
    });
    super("Number", [strategy]);
  }
}

/* NamePlaceholder with case-insensitive prefixes, capturing only the name */
class NamePlaceholder extends GenericPlaceholderType {
  constructor() {
    // ein Name (capitalized words, evtl. mit Bindestrich)
    const namePart = "[A-ZÄÖÜÀ-ÖØ-Ý][a-zäöüßà-öø-ÿ]+(?:-[A-ZÄÖÜÀ-ÖØ-Ý][a-zäöüßà-öø-ÿ]+)?";
    
    // FORMAL: komplette Anrede + Name, case‑insensitive, ersetzt alles
    const formalPattern = `(?:Sehr geehrte[r]? (?:Herr|Frau))\\s+${namePart}(?:\\s+${namePart})*`;
    const formalRegex = new RegExp(formalPattern, "gi");
    const formalStrategy = new RegexDetectionStrategy({
      regex: formalRegex,
      description: "Formal greeting detection",
      groupIndex: 0,   // komplettes Match
      rank: 1
    });

    // CASUAL: nur "Hallo" oder "Guten Tag" exakt so (case‑sensitiv), ersetzt nur den Namen
    const casualPrefixes = ["Hallo", "Guten Tag"];
    const casualPattern = `(?:${casualPrefixes.map(escapeRegExp).join("|")})\\s+(${namePart}(?:\\s+${namePart})*)`;
    const casualRegex = new RegExp(casualPattern, "g");
    const casualStrategy = new RegexDetectionStrategy({
      regex: casualRegex,
      description: "Casual greeting detection",
      groupIndex: 1,   // nur die captured group (den Namen)
      rank: 2
    });

    super("Name", [formalStrategy, casualStrategy]);
  }
}

/* EmailPlaceholder */
class EmailPlaceholder extends GenericPlaceholderType {
  constructor() {
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    const strategy = new RegexDetectionStrategy({
      regex: emailRegex,
      description: "Email detection",
      groupIndex: 0,
      rank: 1
    });
    super("Email", [strategy]);
  }
}

// Expose globally
window.DetectionStrategy = DetectionStrategy;
window.RegexDetectionStrategy = RegexDetectionStrategy;
window.GenericPlaceholderType = GenericPlaceholderType;
window.CustomPlaceholderType = CustomPlaceholderType;
window.NumberPlaceholder = NumberPlaceholder;
window.NamePlaceholder = NamePlaceholder;
window.EmailPlaceholder = EmailPlaceholder;
