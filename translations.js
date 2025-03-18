"use strict";

(function (window) {
  window.translations = {
    de: {
      headerTitle: "Anonymat",
      headerSubtitle: "Persönliche Informationen lokal maskieren",
      addPlaceholder: "Platzhalter hinzufügen",
      settings: "Platzhaltereinstellungen",
      languageChange: "Sprache ändern",
      help: "Hilfe/About",
      mapping: "Mapping anzeigen",
      programSave: "Programm als separate Datei speichern",
      close: "Schließen",
      placeholderOptions: "Platzhaltereinstellungen",
      helpTitle: "Über Anonymizer",
      helpDescription:
        "Anonymizer ist ein Werkzeug zur semiautomatischen Maskierung und Anonymisierung persönlicher Daten in Texten. Es dient dazu, sensible Informationen wie Namen, E-Mail-Adressen, Telefonnummern oder Bankdaten zu erkennen und durch Platzhalter zu ersetzen.",
      helpLocal:
        "Die Anwendung läuft vollständig lokal im Browser und kommuniziert nicht mit externen Diensten.",
      helpDisclaimer:
        "Anonymizer stellt eine Hilfestellung dar – die endgültige Überprüfung liegt beim Anwender.",
      helpLicense:
        "Dieses Projekt ist Open Source und steht unter der MIT-Lizenz.",
      helpVersion: "Version: 1.0.0 | © 2025 DeinName",
      anonymize: "Anonymisieren",
      deanonymize: "Deanonymisieren",
      editorPlaceholder: "Hier Text einfügen...",
      customPatternPlaceholder: "Hier zu ersetzenden Text eingeben",
      anonymizedStatus: "Text vollständig anonymisiert",
      deanonymizedStatus: "Text vollständig deanonymisiert",
      copyToClipboard: "In Zwischenablage kopieren",
      copySuccess: "Text in Zwischenablage kopiert",
      clipboardNotAvailable: "Zwischenablage nicht verfügbar.",
      "contextMenu.makeWholeTextAnonymizable": "Gesamten Text wieder anonymisierbar machen",
      "contextMenu.makeTextAnonymizable": "„{1}“ wieder anonymisierbar machen",
      "contextMenu.removePlaceholder": "Platzhalter-Typ {1} entfernen",
      "contextMenu.unmaskSelection": "Auswahl deanonymisieren",
      "contextMenu.neverAnonymize": "Diese Zeichenkette niemals maskieren",
      "contextMenu.addPlaceholder": "Platzhalter hinzufügen",
      "contextMenu.customPlaceholders": "Benutzerdefinierte Platzhalter",
      "contextMenu.activePlaceholders": "Aktive Platzhalter",
      "contextMenu.noActivePlaceholders": "Aktuell keine aktiven Platzhalter.",
      "contextMenu.additionalPlaceholders": "Weitere Platzhalter",
      "contextMenu.showAdditionalPlaceholders": "Anzeigen",
      "contextMenu.hideAdditionalPlaceholders": "Verbergen",
      "contextMenu.updateStatus": "Status aktualisieren",
      "contextMenu.statusUpdated": "Platzhalter-Status aktualisiert.",
      "contextMenu.anonymizeSelection": "Auswahl anonymisieren ({1})"
    },
    en: {
      headerTitle: "Anonymat",
      headerSubtitle: "Mask personal information locally",
      addPlaceholder: "Add placeholder",
      settings: "Placeholder settings",
      languageChange: "Change language",
      help: "Help/About",
      mapping: "Show mapping",
      programSave: "Save program as separate file",
      close: "Close",
      placeholderOptions: "Placeholder settings",
      helpTitle: "About Anonymizer",
      helpDescription:
        "Anonymizer is a tool for semi-automatic masking and anonymization of personal data in texts. It is designed to detect sensitive information such as names, email addresses, phone numbers, or bank data and replace them with placeholders.",
      helpLocal:
        "The application runs completely locally in the browser and does not communicate with external services.",
      helpDisclaimer:
        "Anonymizer is only a support tool. The final verification is the user's responsibility.",
      helpLicense:
        "This project is open source and is licensed under the MIT license.",
      helpVersion: "Version: 1.0.0 | © 2025 YourName",
      anonymize: "Anonymize",
      deanonymize: "Deanonymize",
      editorPlaceholder: "Insert text here...",
      customPatternPlaceholder: "Enter text to be replaced",
      anonymizedStatus: "Text fully anonymized",
      deanonymizedStatus: "Text fully deanonymized",
      copyToClipboard: "Copy to Clipboard",
      copySuccess: "Text copied to Clipboard",
      clipboardNotAvailable: "Clipboard API not available.",
      "contextMenu.makeWholeTextAnonymizable": "Make entire text anonymizable",
      "contextMenu.makeTextAnonymizable": "Make \"{1}\" anonymizable",
      "contextMenu.removePlaceholder": "Remove placeholder type {1}",
      "contextMenu.unmaskSelection": "Deanonymize selection",
      "contextMenu.neverAnonymize": "Never anonymize this text",
      "contextMenu.addPlaceholder": "Add placeholder",
      "contextMenu.customPlaceholders": "Custom Placeholders",
      "contextMenu.activePlaceholders": "Active Placeholders",
      "contextMenu.noActivePlaceholders": "Currently no active placeholders.",
      "contextMenu.additionalPlaceholders": "Additional Placeholders",
      "contextMenu.showAdditionalPlaceholders": "Show",
      "contextMenu.hideAdditionalPlaceholders": "Hide",
      "contextMenu.updateStatus": "Update status",
      "contextMenu.statusUpdated": "Placeholder status updated.",
      "contextMenu.anonymizeSelection": "Anonymize selection ({1})"
    }
  };

  if (typeof window.translate !== "function") {
    window.translate = function (key, params) {
      const lang = (window.Config && window.Config.get("language")) || "en";
      const trans =
        window.translations[lang] && window.translations[lang][key]
          ? window.translations[lang][key]
          : key;
      if (params && params.length > 0) {
        return trans.replace(/{(\d+)}/g, function (match, number) {
          return typeof params[number - 1] !== "undefined"
            ? params[number - 1]
            : match;
        });
      }
      return trans;
    };
  }
})(window);
