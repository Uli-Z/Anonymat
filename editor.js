"use strict";

document.addEventListener("DOMContentLoaded", function () {
  // Konfiguration der klickbaren Elemente für das Text-Highlighting.
  const clickableElementsConfig = {
    detected: { className: "detected" },
    placeholder: { className: "anonymized" },
    whitelist: { className: "whitelisted" }
  };

  const editor = document.getElementById("editor");
  const highlight = document.getElementById("highlight");
  const progressBar = document.getElementById("progressBar");
  const progressStatus = document.getElementById("progressStatus"); // Optionales Status-Element

  const anonymizeBtn = document.getElementById("anonymizeBtn");
  const deanonymizeBtn = document.getElementById("deanonymizeBtn");

  anonymizeBtn.disabled = true;
  deanonymizeBtn.disabled = true;

  let progressHideTimeout; // Timer für das automatische Ausblenden der Statusmeldung
  let hideBarAnimationTimeout; // Timer, der den CSS-Fadeout steuert

  // Globale Arrays für erkannte sensible Daten und Platzhalter-Tokens.
  let detectedPIIinText = [];
  let placeholderTokensInText = [];

  // Aktualisiert die Debug-Mapping-Tabelle, falls vorhanden.
  function updatePlaceholdersTable() {
    const mappingContainer = document.getElementById("mappingTable");
    if (!mappingContainer) return;
    const mapping = window.anonymizer.getMapping();
    let html = "<table><thead><tr><th>Original</th><th>Token</th><th>Type</th></tr></thead><tbody>";
    mapping.forEach(entry => {
      const original = entry[0];
      const token = entry[1] === null ? "null" : entry[1];
      const type = entry[2].placeholderPrefix;
      html += `<tr>
                <td>${Utils.escapeHtml(original)}</td>
                <td>${Utils.escapeHtml(token)}</td>
                <td>${Utils.escapeHtml(type)}</td>
              </tr>`;
    });
    html += "</tbody></table>";
    mappingContainer.innerHTML = html;
  }

  // Aktualisiert die aktuellen Mapping-Listen basierend auf dem Editor-Text.
  function updateCurrentMappingLists() {
    const snapshot = editor.value;
    const mapping = window.anonymizer.getMapping();
    detectedPIIinText = mapping
      .filter(entry => snapshot.includes(entry[0]))
      .map(entry => entry[0]);
    placeholderTokensInText = mapping
      .filter(entry => snapshot.includes(entry[1]))
      .map(entry => entry[1]);
  }

  // Aktualisiert die UI des Fortschrittsbalkens.
  function updateProgressUI(percent, message) {
    if (window.anonymizer.scanCompleted) return;
    if (progressBar) {
      progressBar.style.display = "block";
      progressBar.classList.add("active");
      progressBar.classList.remove("fade-out");
      const progressFill = document.getElementById("progressFill");
      const progressText = document.getElementById("progressText");
      if (progressFill) progressFill.style.width = percent + "%";
      if (progressText) progressText.innerText = message;
    }
  }

  const throttledProgressUI = Utils.throttle(updateProgressUI, 100);

  // Callback, wenn der Text-Scan abgeschlossen ist.
  function handleProgressComplete() {
    const progressFill = document.getElementById("progressFill");
    const progressText = document.getElementById("progressText");
    if (progressFill) {
      progressFill.style.width = "100%";
      progressFill.classList.add("complete");
    }
    if (progressText) {
      progressText.innerHTML =
        'Text scan complete <span style="font-size:24px;">' + Icons.check + '</span>';
    }
    updatePlaceholdersTable();
    updateButtonStates();
    clearTimeout(progressHideTimeout);
    progressHideTimeout = setTimeout(hideProgressBar, 1000);
  }

  // Blendet den Fortschrittsbalken aus.
  function hideProgressBar() {
    if (progressBar) {
      progressBar.classList.add("fade-out");
      hideBarAnimationTimeout = setTimeout(function () {
        progressBar.classList.remove("active", "fade-out");
        progressBar.style.display = "none";
        const progressFill = document.getElementById("progressFill");
        if (progressFill) {
          progressFill.style.width = "0";
          progressFill.classList.remove("complete");
        }
      }, 1000);
    }
  }

  // Gemeinsame Funktion zum Anzeigen von Statusmeldungen.
  // Alle vorherigen Timer werden zurückgesetzt, sodass die aktuelle Meldung
  // für mindestens 2 Sekunden sichtbar bleibt.
  function showStatusMessage(message, clickHandler) {
    if (progressHideTimeout) {
      clearTimeout(progressHideTimeout);
    }
    if (hideBarAnimationTimeout) {
      clearTimeout(hideBarAnimationTimeout);
    }
    
    progressBar.style.display = "block";
    progressBar.classList.add("active");
    progressBar.classList.remove("fade-out");
    const progressFill = document.getElementById("progressFill");
    const progressText = document.getElementById("progressText");
    if (progressFill) {
      progressFill.style.width = "100%";
      progressFill.classList.add("complete");
    }
    if (progressText) {
      progressText.innerHTML = message;
      progressText.onclick = null;
      if (clickHandler && typeof clickHandler === "function") {
        progressText.style.cursor = "pointer";
        progressText.onclick = clickHandler;
      } else {
        progressText.style.cursor = "default";
      }
    }
    
    progressHideTimeout = setTimeout(function() {
      hideProgressBar();
    }, 2000);
  }

  // Aktualisiert Highlight, Mapping-Listen, Button-Zustände und die Debug-Tabelle.
  function mappingChangeHandler() {
    updateCurrentMappingLists();
    updateHighlight();
    updateButtonStates();
    updatePlaceholdersTable();
  }

  // Aktualisiert den Text basierend auf Anonymizer-Änderungen.
  function handleTextChange() {
    editor.value = window.anonymizer.getText();
    updateCurrentMappingLists();
    updateHighlight();
    updatePlaceholdersTable();
  }

  const throttledMappingChange = Utils.throttle(mappingChangeHandler, 100);

  // Aktualisiert die Highlight-Schicht basierend auf erkannten Intervallen.
  async function updateHighlight() {
    const text = editor.value;
    if (text.trim() === "") {
      highlight.innerHTML = `<span class="placeholder">${editor.placeholder}</span>`;
      highlight.className = "";
      return;
    }

    let intervals = [];

    // Intervalle für erkannte PII und Platzhalter sammeln.
    let detectedIntervals = Utils.collectIntervals(text, detectedPIIinText, clickableElementsConfig.detected.className);
    detectedIntervals = Utils.mergeOverlappingIntervals(detectedIntervals);
    intervals = intervals.concat(detectedIntervals);
    intervals = intervals.concat(Utils.collectIntervals(text, placeholderTokensInText, clickableElementsConfig.placeholder.className));

    // Whitelist-Intervalle hinzufügen.
    const whitelistItems = window.anonymizer.whitelist.filter(item => item.trim() !== "");
    intervals = intervals.concat(Utils.collectIntervals(text, whitelistItems, clickableElementsConfig.whitelist.className));

    intervals.sort((a, b) => a.start - b.start);

    let result = "";
    let currentIndex = 0;
    intervals.forEach(interval => {
      result += Utils.escapeHtml(text.substring(currentIndex, interval.start));
      result += `<span class="${interval.className}">` + Utils.escapeHtml(text.substring(interval.start, interval.end)) + "</span>";
      currentIndex = interval.end;
    });
    result += Utils.escapeHtml(text.substring(currentIndex));
    highlight.innerHTML = result;

    // Schaltet die Highlight-Klassen.
    if (detectedPIIinText.length > 0) {
      highlight.classList.add("highlight-detected");
      highlight.classList.remove("highlight-clean");
    } else {
      highlight.classList.add("highlight-clean");
      highlight.classList.remove("highlight-detected");
    }

    highlight.style.height = editor.scrollHeight + "px";
  }

  // Aktiviert/deaktiviert Buttons basierend auf dem Textzustand.
  function updateButtonStates() {
    anonymizeBtn.disabled = detectedPIIinText.length === 0;
    deanonymizeBtn.disabled = placeholderTokensInText.length === 0;
  }

  editor.addEventListener("input", function () {
    clearTimeout(progressHideTimeout);
    clearTimeout(hideBarAnimationTimeout);
    highlight.innerText = editor.value;
    window.anonymizer.setText(editor.value);
    window.anonymizer.identifyPII();
    throttledMappingChange.flush();
  });

  editor.addEventListener("scroll", function () {
    highlight.style.transform = `translate(-${editor.scrollLeft}px, -${editor.scrollTop}px)`;
  });

  // Beim Klick auf "Anonymisieren": Zeige eine Statusmeldung ohne Kopierfunktion.
  anonymizeBtn.addEventListener("click", function () {
    window.anonymizer.anonymize();
    anonymizeBtn.disabled = true;
    updateButtonStates();

    showStatusMessage(
      `<span style="font-size:24px; color: green;">${Icons.check}</span> ${window.translate("anonymizedStatus")}`
    );
  });

  // Beim Klick auf "Deanonymisieren": Zeige eine Statusmeldung.
  deanonymizeBtn.addEventListener("click", function () {
    window.anonymizer.deanonymize();
    updateHighlight();
    updateButtonStates();
    showStatusMessage(
      `<span style="font-size:24px; color: green;">${Icons.check}</span> ${window.translate("deanonymizedStatus")}`
    );
  });

  // Registriere Anonymizer-Callbacks.
  window.anonymizer.setOnMappingChange(throttledMappingChange);
  window.anonymizer.setOnProgress(throttledProgressUI);
  window.anonymizer.setOnComplete(handleProgressComplete);
  window.anonymizer.setOnTextChange(handleTextChange);

  // Event-Listener für den Overlay-Copy-Button.
  const copyOverlayBtn = document.getElementById("copyOverlayBtn");
  if (copyOverlayBtn) {
    copyOverlayBtn.addEventListener("click", function () {
      const text = window.anonymizer.getText();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          const originalText = copyOverlayBtn.innerHTML;
          copyOverlayBtn.innerHTML = `<span style="font-size:16px;">📋</span> ${window.translate("copySuccess")}`;
          setTimeout(function () {
            copyOverlayBtn.innerHTML = originalText;
          }, 3000);
        });
      } else {
        alert(window.translate("clipboardNotAvailable"));
      }
    });
  }

  // Initialer Aufruf zum Aktualisieren des Highlights.
  updateHighlight();
});
