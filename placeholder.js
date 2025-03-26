"use strict";

// Helper to escape regex special characters.
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* Base class for detection strategies */
class DetectionStrategy {
  detect(text, currentMapping) {
    throw new Error("detect() not implemented");
  }
}

/* Regex detection strategy with optional prefixes and suffixes */
class RegexDetectionStrategy extends DetectionStrategy {
  /**
   * Options:
   *   - regex: RegExp for the main pattern.
   *   - description: Description of the strategy.
   *   - groupIndex: Capture group index for the main match (default 0).
   *   - prefixes: Optional array of strings that must precede the main match.
   *   - suffixes: Optional array of strings that must follow the main match.
   */
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
      if (currentMapping.some(e => e.original === detectedValue && e.strategy === this))
        continue;
      // Calculate the start index of the captured group within the overall match.
      let offset = m[0].indexOf(detectedValue);
      if (offset < 0) offset = 0;
      const start = m.index + offset;
      const end = start + detectedValue.length;
      results.push({
        original: detectedValue,
        token: null,
        strategy: this,
        rank: 1,
        start: start,
        end: end
      });
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
  }

  getNextTokenName(currentMapping) {
    let token = `[${this.placeholderPrefix}]`;
    if (!currentMapping.some(e => e.token === token)) return token;
    let counter = 2;
    token = `[${this.placeholderPrefix}_${counter}]`;
    while (currentMapping.some(e => e.token === token)) {
      counter++;
      token = `[${this.placeholderPrefix}_${counter}]`;
    }
    return token;
  }

  // Run all detection strategies and clean the results.
  detect(text, currentMapping) {
    let results = [];
    for (const strategy of this.detectionStrategies) {
      const detected = strategy.detect(text, currentMapping);
      results = results.concat(detected);
    }
    return this.cleanMatches(results);
  }

  // Remove duplicate matches and those completely overlapped by another.
  cleanMatches(matches) {
    const unique = [];
    for (const m of matches) {
      if (!unique.some(u => u.start === m.start && u.end === m.end))
        unique.push(m);
    }
    return unique.filter(m =>
      !unique.some(other => other !== m && other.start <= m.start && other.end >= m.end)
    );
  }
}

/* Placeholder for detecting names using regex with prefixes */
class NamePlaceholder extends GenericPlaceholderType {
  constructor() {
    // Define common prefixes that must appear before a name.
    const prefixes = [
      "Mit freundlichen Grüßen,?",
      "Liebe Grüße,?",
      "Viele Grüße,?",
      "Best regards,?",
      "Cordialement,?",
      "Guten Morgen",
      "Guten Tag",
      "Hallo",
      "Liebe",
      "Lieber",
      "Moin",
      "Grüß dich",
      "Servus",
      "Sehr geehrte(r)? (?:Herr|Frau)",
      "Herr",
      "Herrn",
      "Frau",
      "Prof\\.",
      "Dr\\.",
      "Dear Mr\\.",
      "Dear Mrs\\.",
      "Dear Ms\\.",
      "Dear Miss",
      "Hello",
      "Hi",
      "Hey",
      "Greetings",
      "Chère(?: Monsieur| Madame)?",
      "Salut",
      "Monsieur",
      "Madame",
      "Estimado(?: Sr\\.?| Señor|Señora)?",
      "Hola",
      "Querido",
      "Querida",
      "Saludos cordiales,?"
    ];
    // Pattern for a name: one token with optional additional parts.
    const namePattern = "[A-ZÄÖÜÀ-ÖØ-Ý][a-zäöüßà-öø-ÿ]+(?:-[A-ZÄÖÜÀ-ÖØ-Ý][a-zäöüßà-öø-ÿ]+)?(?:\\s+[A-ZÄÖÜÀ-ÖØ-Ý][a-zäöüßà-öø-ÿ]+){0,2}";
    const nameStrategy = new RegexDetectionStrategy({
      regex: new RegExp(namePattern, "g"),
      description: "Name detection with prefixes",
      groupIndex: 0,
      prefixes: prefixes
    });
    super("Name", [nameStrategy]);
  }
}

/* Placeholder for detecting numbers using a regex */
class NumberPlaceholder extends GenericPlaceholderType {
  constructor() {
    const numberRegex = /(?<!\d)[1-9](?:[ .\-\/\\]*\d){3,}(?!\d)/g;
    const numberStrategy = new RegexDetectionStrategy({
      regex: numberRegex,
      description: "Number detection",
      groupIndex: 0
    });
    super("Number", [numberStrategy]);
  }
}

window.DetectionStrategy = DetectionStrategy;
window.RegexDetectionStrategy = RegexDetectionStrategy;
window.GenericPlaceholderType = GenericPlaceholderType;
window.NamePlaceholder = NamePlaceholder;
window.NumberPlaceholder = NumberPlaceholder;
