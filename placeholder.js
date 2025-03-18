"use strict";

(function (window) {
  /**
   * Base class for regex-based placeholder types.
   */
  class RegExpPlaceholderType {
    constructor(regex, placeholderPrefix) {
      this.regex = regex;
      this.placeholderPrefix = placeholderPrefix;
      this.id = placeholderPrefix;
      this.rank = 1;
      this.enabled = true;
    }

    getRegex() {
      return this.regex;
    }

    // Modified: The first token is generated without a number.
    // Subsequent tokens are generated with an underscore and an increasing counter.
    getNextTokenName(mapping) {
      // First token without any number
      let token = `[${this.placeholderPrefix}]`;
      if (!mapping.find(e => e[1] === token)) return token;
      // For subsequent tokens, start counter at 2 with an underscore.
      let counter = 2;
      token = `[${this.placeholderPrefix}_${counter}]`;
      while (mapping.find(e => e[1] === token)) {
        counter++;
        token = `[${this.placeholderPrefix}_${counter}]`;
      }
      return token;
    }

    // Identify PII matches using the regex. Returns an array of [match, null, this].
    identifyPII(text, currentMapping) {
      const results = [];
      const regex = new RegExp(this.getRegex().source, "gi");
      let m;
      while ((m = regex.exec(text)) !== null) {
        const match = m[0];
        if (currentMapping.find(e => e[0] === match && e[2] === this)) continue;
        if (results.find(e => e[0] === match && e[2] === this)) continue;
        results.push([match, null, this]);
      }
      return results;
    }
  }

  /**
   * Custom placeholder type supporting user-defined patterns.
   */
  class CustomPlaceholderType extends RegExpPlaceholderType {
    constructor(pattern, label) {
      let regex;
      if (pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
        regex = new RegExp(pattern.slice(1, pattern.lastIndexOf("/")), "gi");
      } else {
        regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "gi");
      }
      super(regex, label);
      this.isCustom = true;
      this.rank = 0; // Process custom placeholders first
    }
  }

  /**
   * Email placeholder type.
   */
  class EmailPlaceholderType extends RegExpPlaceholderType {
    constructor() {
      super(
        /\b(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))\b/g,
        "Email"
      );
      this.rank = 1;
    }
  }

  /**
   * IBAN placeholder type.
   */
  class IBANPlaceholderType extends RegExpPlaceholderType {
    constructor() {
      super(/[A-Z]{2}\d{2}[A-Z0-9]{11,30}/gi, "IBAN");
      this.rank = 0;
    }
  }

  /**
   * DateTime placeholder type.
   */
  class DateTimePlaceholderType extends RegExpPlaceholderType {
    constructor() {
      super(/\b\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2})?\b/g, "DateTime");
      this.rank = 1;
      // Offset can be used for random adjustments if needed
      this.offsetMilliseconds = (Math.random() * 20 - 10) * 24 * 3600 * 1000;
    }
  }

  /**
   * URL placeholder type.
   */
  class URLPlaceholderType extends RegExpPlaceholderType {
    constructor() {
      super(/(https?:\/\/[^\s]+)/gi, "URL");
      this.rank = 1;
    }
  }

  /**
   * Credit Card placeholder type.
   */
  class CreditCardPlaceholderType extends RegExpPlaceholderType {
    constructor() {
      super(/\b\d{16}\b/g, "CreditCard");
      this.rank = 1;
    }
  }

  /**
   * Social Security Number placeholder type.
   */
  class SocialSecurityPlaceholderType extends RegExpPlaceholderType {
    constructor() {
      super(/\b\d{3}-\d{2}-\d{4}\b/g, "SSN");
      this.rank = 1;
    }
  }

  /**
   * Phone placeholder type.
   */
  class PhonePlaceholderType extends RegExpPlaceholderType {
    constructor() {
      super(/(?<![A-Za-z0-9])(\+?\d[\d\s\/-]{6,}\d)(?![A-Za-z0-9])/g, "Phone");
      this.rank = 2;
    }
  }

  /**
   * Number placeholder type.
   */
  class NumberPlaceholderType extends RegExpPlaceholderType {
    constructor() {
      super(/(?<!\d)[1-9](?:[ .\-\/\\]*\d){3,}(?!\d)/g, "Number");
      this.rank = 3;
    }
  }

  /**
   * Name placeholder type with context-based detection.
   */
  class NamePlaceholderType extends RegExpPlaceholderType {
    constructor() {
      super(/()/g, "Name");
      this.rank = 4;
      this.counter = 1;
    }

    // Builds a regex that detects names following common greeting contexts.
    buildRegex() {
      const contexts = [
        "Mit\\s+freundlichen\\s+Grüßen,?",
        "Liebe\\s+Grüße,?",
        "Viele\\s+Grüße,?",
        "Best\\s+regards,?",
        "Cordialement,?",
        "Guten\\s+Morgen",
        "Guten\\s+Tag",
        "Hallo",
        "Liebe",
        "Lieber",
        "Moin",
        "Grüß\\s+dich",
        "Servus",
        "Sehr\\s+geehrte(?:r)?\\s+(?:Herr|Frau)",
        "Herr",
        "Herrn",
        "Frau",
        "Prof\\.",
        "Dr\\.",
        "Dear\\s+Mr\\.",
        "Dear\\s+Mrs\\.",
        "Dear\\s+Ms\\.",
        "Dear\\s+Miss",
        "Hello",
        "Hi",
        "Hey",
        "Greetings",
        "Best\\s+regards,?",
        "Chère(?:\\s+Monsieur|\\s+Madame)?",
        "Salut",
        "Monsieur",
        "Madame",
        "Estimado(?:\\s+(?:Sr\\.?|Señor|Señora))?",
        "Hola",
        "Querido",
        "Querida",
        "Saludos\\s+cordiales,?"
      ];
      contexts.sort((a, b) => b.length - a.length);
      const contextPattern = "(?:" + contexts.join("|") + ")";
      const nameToken = "[A-ZÄÖÜÀ-ÖØ-Ý][a-zäöüßà-öø-ÿ]+(?:-[A-ZÄÖÜÀ-ÖØ-Ý][a-zäöüßà-öø-ÿ]+)?";
      const namePattern = "(?:" + nameToken + "(?:\\s+" + nameToken + "){0,2})";
      return new RegExp("(" + contextPattern + ")\\s+(?=[A-ZÄÖÜÀ-ÖØ-Ý])(" + namePattern + ")(?=$|\\s|[,.!?])", "g");
    }

    identifyPII(text, currentMapping) {
      const results = [];
      const regex = this.buildRegex();
      let m;
      while ((m = regex.exec(text)) !== null) {
        const name = m[2];
        if (currentMapping.find(e => e[0] === name && e[2] === this)) continue;
        if (results.find(e => e[0] === name && e[2] === this)) continue;
        results.push([name, null, this, false]);
      }
      return results;
    }
  }

  /**
   * Date placeholder type that uses various date formats.
   * Assumes 'dateFormats' is defined globally (e.g., in date.js).
   */
  class DatePlaceholderType extends RegExpPlaceholderType {
    constructor() {
      super(/()/, "Date");
      this.rank = 1;
      this.dateFormats = DatePlaceholderType.getDateFormats();
      const sampleDate = new Date(2020, 0, 1);
      this.dateFormats.forEach(df => {
        df.computedExample = df.format(sampleDate);
      });
    }

    identifyPII(text, currentMapping) {
      const results = [];
      const sortedFormats = this.dateFormats.slice().sort((a, b) => b.computedExample.length - a.computedExample.length);
      sortedFormats.forEach(df => {
        const regex = new RegExp(df.pattern, "gi");
        let m;
        while ((m = regex.exec(text)) !== null) {
          const match = m[0];
          if (currentMapping.find(e => e[0] === match && e[2] === this)) continue;
          results.push([match, null, this, false]);
        }
      });
      return results;
    }

    static getDateFormats() {
      return dateFormats;
    }
  }

  // Expose classes to the global scope
  window.CustomPlaceholderType = CustomPlaceholderType;
  window.EmailPlaceholderType = EmailPlaceholderType;
  window.IBANPlaceholderType = IBANPlaceholderType;
  window.DateTimePlaceholderType = DateTimePlaceholderType;
  window.URLPlaceholderType = URLPlaceholderType;
  window.CreditCardPlaceholderType = CreditCardPlaceholderType;
  window.SocialSecurityPlaceholderType = SocialSecurityPlaceholderType;
  window.PhonePlaceholderType = PhonePlaceholderType;
  window.NumberPlaceholderType = NumberPlaceholderType;
  window.NamePlaceholderType = NamePlaceholderType;
  window.DatePlaceholderType = DatePlaceholderType;
})(window);
