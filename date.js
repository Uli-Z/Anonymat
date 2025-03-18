"use strict";

/**
 * Returns a 2-digit string for a given number.
 * Example: pad2(5) returns "05"
 */
function pad2(n) {
  return n < 10 ? "0" + n : "" + n;
}

/**
 * Returns an array of full month names for the specified language.
 * Supported language codes: "deu", "en", "fr", "es"
 */
function getMonthNames(language) {
  switch (language) {
    case "deu":
      return [
        "Januar", "Februar", "März", "April", "Mai", "Juni",
        "Juli", "August", "September", "Oktober", "November", "Dezember"
      ];
    case "en":
      return [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ];
    case "fr":
      return [
        "janvier", "février", "mars", "avril", "mai", "juin",
        "juillet", "août", "septembre", "octobre", "novembre", "décembre"
      ];
    case "es":
      return [
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
      ];
    default:
      throw new Error("Unsupported language: " + language);
  }
}

/**
 * Returns an array of abbreviated month names for the specified language.
 * Supported language codes: "deu", "en", "fr", "es"
 */
function getAbbreviatedMonthNames(language) {
  switch (language) {
    case "deu":
      return ["Jan.", "Feb.", "Mär.", "Apr.", "Mai", "Jun.", "Jul.", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];
    case "en":
      return ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];
    case "fr":
      return ["jan.", "fév.", "mars", "avr.", "mai", "juin", "juil.", "août", "sep.", "oct.", "nov.", "déc."];
    case "es":
      return ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sept.", "oct.", "nov.", "dic."];
    default:
      throw new Error("Unsupported language: " + language);
  }
}

/**
 * An array of date format definitions.
 * Each format has a description, an example, a regex pattern for matching,
 * and a function to format a Date object accordingly.
 */
const dateFormats = [
  {
    description: "dd.mm.yyyy",
    example: "31.12.2020",
    pattern: "\\b\\d{2}\\.\\d{1,2}\\.\\d{4}\\b",
    format: d => pad2(d.getDate()) + "." + pad2(d.getMonth() + 1) + "." + d.getFullYear()
  },
  {
    description: "m/yyyy",
    example: "1/2020",
    pattern: "\\b\\d{1,2}\\/\\d{4}\\b",
    format: d => (d.getMonth() + 1) + "/" + d.getFullYear()
  },
  {
    description: "dd. Monatsname Jahr (de) – voll",
    example: "31. Dezember 2020",
    pattern: `\\b\\d{1,2}\\.\\s+(?:(?:${getMonthNames("deu").join("|")})|(?:${getAbbreviatedMonthNames("deu").join("|")}))\\s\\d{4}\\b`,
    format: d => pad2(d.getDate()) + ". " + getMonthNames("deu")[d.getMonth()] + " " + d.getFullYear()
  },
  {
    description: "Monatsname",
    example: "November",
    pattern: `\\b(?:(?:${getMonthNames("deu").join("|")})|(?:${getAbbreviatedMonthNames("deu").join("|")}))(?=\\s|$)`,
    format: d => getMonthNames("deu")[d.getMonth()]
  },
  {
    description: "Monatsname yyyy (de)",
    example: "November 2020",
    pattern: `\\b(?:(?:${getMonthNames("deu").join("|")})|(?:${getAbbreviatedMonthNames("deu").join("|")}))\\s\\d{4}\\b`,
    format: d => getMonthNames("deu")[d.getMonth()] + " " + d.getFullYear()
  },
  {
    description: "Month Day, Year (en)",
    example: "December 31, 2020",
    pattern: `\\b(?:${getMonthNames("en").join("|")})\\s\\d{1,2},\\s\\d{4}\\b`,
    format: d => getMonthNames("en")[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear()
  },
  {
    description: "YYYY-MM-DD",
    example: "2020-12-31",
    pattern: "\\b\\d{4}-\\d{1,2}-\\d{1,2}\\b",
    format: d => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate())
  },
  {
    description: "Context: Jahr YYYY (de/en/fr)",
    example: "Jahr 1989",
    pattern: "\\b(?:Jahr|in|year|en|année)\\s+([12]\\d{3})\\b",
    format: d => "Jahr " + d.getFullYear().toString()
  },
  {
    description: "dd.MM. (de) – ohne Jahr",
    example: "31.12.",
    pattern: "\\b\\d{2}\\.\\d{2}(?:\\.)?(?=\\s|$)",
    format: d => pad2(d.getDate()) + "." + pad2(d.getMonth() + 1) + "."
  },
  {
    description: "Month Day (en) – ohne Jahr",
    example: "November 27",
    pattern: `\\b(?:${getMonthNames("en").join("|")})\\s\\d{1,2}\\b`,
    format: d => getMonthNames("en")[d.getMonth()] + " " + d.getDate()
  },
  {
    description: "dd MMMM (fr) – ohne Jahr",
    example: "31 décembre",
    pattern: `\\b\\d{1,2}\\s(?:${getMonthNames("fr").join("|")})\\b`,
    format: d => d.getDate() + " " + getMonthNames("fr")[d.getMonth()]
  },
  {
    description: "dd de MMMM (es) – ohne Jahr",
    example: "31 de diciembre",
    pattern: `\\b\\d{1,2}\\sde\\s(?:${getMonthNames("es").join("|")})\\b`,
    format: d => d.getDate() + " de " + getMonthNames("es")[d.getMonth()]
  },
  {
    description: "MM/DD/YYYY (en, US)",
    example: "12/31/2020",
    pattern: "\\b(0?[1-9]|1[0-2])\\/(0?[1-9]|[12][0-9]|3[01])\\/(\\d{4})\\b",
    format: d => pad2(d.getMonth() + 1) + "/" + pad2(d.getDate()) + "/" + d.getFullYear()
  },
  {
    description: "MMM dd, yyyy (en, abbreviated)",
    example: "Dec 31, 2020",
    pattern: `\\b(?:${getAbbreviatedMonthNames("en").join("|")})\\s\\d{1,2},\\s\\d{4}\\b`,
    format: d => getAbbreviatedMonthNames("en")[d.getMonth()] + " " + pad2(d.getDate()) + ", " + d.getFullYear()
  },
  {
    description: "dd MMMM yyyy (fr)",
    example: "31 décembre 2020",
    pattern: `\\b\\d{1,2}\\s(?:${getMonthNames("fr").join("|")})\\s\\d{4}\\b`,
    format: d => pad2(d.getDate()) + " " + getMonthNames("fr")[d.getMonth()] + " " + d.getFullYear()
  },
  {
    description: "dd MMM yyyy (fr, abbreviated)",
    example: "31 déc. 2020",
    pattern: `\\b\\d{1,2}\\s(?:${getAbbreviatedMonthNames("fr").join("|")})\\s\\d{4}\\b`,
    format: d => pad2(d.getDate()) + " " + getAbbreviatedMonthNames("fr")[d.getMonth()] + " " + d.getFullYear()
  },
  {
    description: "dd 'de' MMMM 'de' yyyy (es)",
    example: "31 de diciembre de 2020",
    pattern: `\\b\\d{1,2}\\sde\\s(?:${getMonthNames("es").join("|")})\\sde\\s\\d{4}\\b`,
    format: d => pad2(d.getDate()) + " de " + getMonthNames("es")[d.getMonth()] + " de " + d.getFullYear()
  },
  {
    description: "dd MMM yyyy (es, abbreviated)",
    example: "31 dic. 2020",
    pattern: `\\b\\d{1,2}\\s(?:${getAbbreviatedMonthNames("es").join("|")})\\s\\d{4}\\b`,
    format: d => pad2(d.getDate()) + " " + getAbbreviatedMonthNames("es")[d.getMonth()] + " " + d.getFullYear()
  }
];

// Expose helper functions and dateFormats to the global scope.
(function (window) {
  window.pad2 = pad2;
  window.getMonthNames = getMonthNames;
  window.getAbbreviatedMonthNames = getAbbreviatedMonthNames;
  window.dateFormats = dateFormats;
})(window);
