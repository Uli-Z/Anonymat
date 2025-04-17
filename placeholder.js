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
    this.groupIndex = options.groupIndex || 0;
    if (options.prefixes || options.suffixes) {
      let pattern = "";
      if (options.prefixes) {
        const prefixPattern = options.prefixes.map(escapeRegExp).join("|");
        pattern += "(?:" + prefixPattern + ")\\s*";
      }
      pattern += "(" + options.regex.source + ")";
      if (options.suffixes) {
        const suffixPattern = options.suffixes.map(escapeRegExp).join("|");
        pattern += "\\s*(?:" + suffixPattern + ")";
      }
      this.regex = new RegExp(pattern, options.regex.flags);
      this.groupIndex = 1;
    } else {
      this.regex = options.regex;
    }
  }

  detect(text, currentMapping) {
    const results = [];
    const regex = new RegExp(this.regex.source, this.regex.flags);
    let m;
    while ((m = regex.exec(text)) !== null) {
      const detectedValue = m[this.groupIndex] || m[0];
      if (!detectedValue) continue;
      if (currentMapping.some(e => e[1] === detectedValue && e[2] === this)) continue;
      let offset = m[0].indexOf(detectedValue);
      if (offset < 0) offset = 0;
      const start = m.index + offset;
      const end = start + detectedValue.length;
      results.push({ original: detectedValue, token: null, strategy: this, rank: 1, start, end });
    }
    return results;
  }
}

/* Generic placeholder type that aggregates multiple detection strategies */
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
    for (const strategy of this.detectionStrategies) {
      results = results.concat(strategy.detect(text, currentMapping));
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

/* CustomPlaceholderType – now with robust slash‑regex parsing */
class CustomPlaceholderType extends GenericPlaceholderType {
  constructor(pattern, placeholderPrefix) {
    let regex;
    // parse /pattern/flags
    const slashRe = /^\/(.+)\/([gimsuy]*)$/;
    const match = pattern.match(slashRe);
    if (match) {
      const body = match[1];
      let flags = match[2] || "";
      if (!flags.includes("g")) flags += "g";
      regex = new RegExp(body, flags);
    } else {
      // literal string match
      regex = new RegExp(escapeRegExp(pattern), "g");
    }
    const strategy = new RegexDetectionStrategy({
      regex: regex,
      description: `Custom placeholder for pattern: ${pattern}`,
      groupIndex: 0
    });
    super(placeholderPrefix, [strategy]);
    this.pattern = pattern;
    this.isCustom = true;
  }

  identifyPII(text, currentMapping) {
    return this.detect(text, currentMapping);
  }
}

/* Placeholder for detecting numbers */
class NumberPlaceholder extends GenericPlaceholderType {
  constructor() {
    const numberRegex = /(?<!\d)[1-9](?:[ .\-\/\\]*\d){2,}(?!\d)/g;
    const strategy = new RegexDetectionStrategy({
      regex: numberRegex,
      description: "Number detection",
      groupIndex: 0
    });
    super("Number", [strategy]);
  }
}

/* Placeholder for detecting names with prefixes */
class NamePlaceholder extends GenericPlaceholderType {
  constructor() {
    const prefixes = [
      "Mit freundlichen Grüßen,?", "Liebe Grüße,?", "Viele Grüße,?",
      "Best regards,?", "Cordialement,?", "Guten Morgen", "Guten Tag",
      "Hallo", "Liebe", "Lieber", "Moin", "Grüß dich", "Servus",
      "Sehr geehrte(r)? (?:Herr|Frau)", "Herr", "Herrn", "Frau",
      "Prof\\.", "Dr\\.", "Dear Mr\\.", "Hello", "Hi", "Hey", "Greetings"
    ];
    const namePattern = "[A-ZÄÖÜÀ-ÖØ-Ý][a-zäöüßà-öø-ÿ]+(?:-[A-ZÄÖÜÀ-ÖØ-Ý][a-zäöüßà-öø-ÿ]+)?(?:\\s+[A-ZÄÖÜÀ-ÖØ-Ý][a-zäöüßà-öø-ÿ]+){0,2}";
    const strategy = new RegexDetectionStrategy({
      regex: new RegExp(namePattern, "g"),
      description: "Name detection with prefixes",
      groupIndex: 0,
      prefixes: prefixes
    });
    super("Name", [strategy]);
  }
}

/* Placeholder for detecting email addresses */
class EmailPlaceholder extends GenericPlaceholderType {
  constructor() {
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    const strategy = new RegexDetectionStrategy({
      regex: emailRegex,
      description: "Email detection",
      groupIndex: 0
    });
    super("Email", [strategy]);
  }
}

// expose globally
window.DetectionStrategy = DetectionStrategy;
window.RegexDetectionStrategy = RegexDetectionStrategy;
window.GenericPlaceholderType = GenericPlaceholderType;
window.CustomPlaceholderType = CustomPlaceholderType;
window.NumberPlaceholder = NumberPlaceholder;
window.NamePlaceholder = NamePlaceholder;
window.EmailPlaceholder = EmailPlaceholder;
