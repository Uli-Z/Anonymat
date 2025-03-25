"use strict";

(function (window) {
  document.addEventListener("DOMContentLoaded", function () {
    // Ensure window.Icons is defined with the required properties.
    window.Icons = window.Icons || {
      anonymize: "🛡️",
      deanonymize: "👀",
      check: "✅",
      addPlaceholder: "➕",
      options: "🛠️",
      help: "💡",
      logo: "", // Set your logo icon if needed
      mapping: "📋"
    };

    // -----------------------------
    // Language and Translation Setup
    // -----------------------------
    const languageSelect = document.getElementById("languageSelect");
    if (languageSelect) {
      languageSelect.value = window.Config.get("language");
      languageSelect.addEventListener("change", function (e) {
        window.Config.set("language", e.target.value);
        updateLanguage();
      });
    }
    function updateLanguage() {
      const lang = window.Config.get("language") || "en";
      // Update elements with data-i18n attribute
      document.querySelectorAll("[data-i18n]").forEach(el => {
        const key = el.getAttribute("data-i18n");
        if (window.translations && window.translations[lang] && window.translations[lang][key]) {
          el.textContent = window.translations[lang][key];
        }
      });
      // Update alt/title/aria-label for elements with data-i18n-alt
      document.querySelectorAll("[data-i18n-alt]").forEach(el => {
        const key = el.getAttribute("data-i18n-alt");
        if (window.translations && window.translations[lang] && window.translations[lang][key]) {
          const translation = window.translations[lang][key];
          el.setAttribute("title", translation);
          el.setAttribute("aria-label", translation);
        }
      });
      // Update placeholder text for elements with data-i18n-placeholder
      document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
        const key = el.getAttribute("data-i18n-placeholder");
        if (window.translations && window.translations[lang] && window.translations[lang][key]) {
          el.placeholder = window.translations[lang][key];
        }
      });
      // Trigger editor update for dynamic content
      const editor = document.getElementById("editor");
      if (editor) {
        editor.dispatchEvent(new Event("input"));
      }
    }
    window.updateLanguage = updateLanguage; // Damit ist die Funktion global verfügbar
updateLanguage()
    updateLanguage();

    // -----------------------------
    // Modal Close Button Handlers using window.Modal functions
    // -----------------------------
    const closeSettingsModalBtn = document.getElementById("closeSettingsModalBtn");
    const closeGeneralModalBtn = document.getElementById("closeGeneralModalBtn");
    const closeHelpModalBtn = document.getElementById("closeHelpModalBtn");
    const closeMappingModalBtn = document.getElementById("closeMappingModalBtn");
    if (closeSettingsModalBtn) {
      closeSettingsModalBtn.addEventListener("click", function () {
        window.Modal.hideModal("settingsModal");
      });
    }
    if (closeGeneralModalBtn) {
      closeGeneralModalBtn.addEventListener("click", function () {
        window.Modal.hideModal("generalModal");
      });
    }
    if (closeHelpModalBtn) {
      closeHelpModalBtn.addEventListener("click", function () {
        window.Modal.hideModal("helpModal");
      });
    }
    if (closeMappingModalBtn) {
      closeMappingModalBtn.addEventListener("click", function () {
        window.Modal.hideModal("mappingModal");
      });
    }
    window.addEventListener("click", function (event) {
      const mappingModal = document.getElementById("mappingModal");
      if (event.target === mappingModal) {
        window.Modal.hideModal("mappingModal");
      }
    });


    // -----------------------------
    // Header and Side Menu Setup
    // -----------------------------
    const headerLogo = document.getElementById("headerLogo");
    if (headerLogo && window.Icons && window.Icons.logo) {
      headerLogo.innerHTML = window.Icons.logo;
    }
    const headerAddBtn = document.getElementById("headerAddPlaceholder");
    const headerSettingsBtn = document.getElementById("headerSettings");
    const headerGeneralBtn = document.getElementById("headerGeneral");
    const headerHelpBtn = document.getElementById("headerHelp");
    const headerMappingBtn = document.getElementById("headerMapping");
    const downloadProgramBtn = document.getElementById("downloadProgramBtn");

    if (headerAddBtn && window.Icons && window.Icons.addPlaceholder) {
      headerAddBtn.addEventListener("click", function () {
        window.Modal.openCustomPlaceholderModal("");
      });
    }
    if (headerSettingsBtn && window.Icons && window.Icons.options) {
      headerSettingsBtn.addEventListener("click", function () {
        window.Modal.showModal("settingsModal");
        window.Modal.updatePlaceholderOptions();
      });
    }
    if (headerGeneralBtn) {
      headerGeneralBtn.addEventListener("click", function () {
        window.Modal.showModal("generalModal");
      });
    }
    if (headerHelpBtn && window.Icons && window.Icons.help) {
      headerHelpBtn.addEventListener("click", function () {
        window.Modal.showModal("helpModal");
      });
    }
    if (headerMappingBtn) {
      headerMappingBtn.addEventListener("click", function () {
        updateMappingModal();
        window.Modal.showModal("mappingModal");
      });
    }
    if (downloadProgramBtn) {
      downloadProgramBtn.addEventListener("click", async function () {
        const configBlock = `<!-- CONFIG-START -->
<script>
  window.AppConfig = ${JSON.stringify(window.Config.config, null, 2)};
</script>
<!-- CONFIG-END -->`;
        let finalHtml = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
        finalHtml = finalHtml.replace(/<!--\s*CONFIG-START[\s\S]*?CONFIG-END\s*-->/, configBlock);
        if (window.showSaveFilePicker) {
          try {
            const opts = {
              types: [{
                description: "HTML Files",
                accept: { "text/html": [".html"] }
              }]
            };
            const handle = await window.showSaveFilePicker(opts);
            const writable = await handle.createWritable();
            await writable.write(finalHtml);
            await writable.close();
          } catch (err) {
            console.error("Save cancelled", err);
          }
        } else {
          const blob = new Blob([finalHtml], { type: "text/html" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "programm.html";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      });
    }

    // -----------------------------
    // Side Menu for Small Screens
    // -----------------------------
    const openMenuBtn = document.getElementById("openMenu");
    const closeMenuBtn = document.getElementById("closeMenu");
    const sideMenu = document.getElementById("sideMenu");
    if (openMenuBtn) {
      openMenuBtn.addEventListener("click", function () {
        sideMenu.classList.add("open");
      });
    }
    if (closeMenuBtn) {
      closeMenuBtn.addEventListener("click", function () {
        sideMenu.classList.remove("open");
      });
    }
    const menuAddPlaceholder = document.getElementById("menuAddPlaceholder");
    const menuSettings = document.getElementById("menuSettings");
    const menuGeneral = document.getElementById("menuGeneral");
    const menuHelp = document.getElementById("menuHelp");
    const menuMapping = document.getElementById("menuMapping");
    const menuDownload = document.getElementById("menuDownload");
    if (menuAddPlaceholder) {
      menuAddPlaceholder.addEventListener("click", function (e) {
        e.preventDefault();
        window.Modal.openCustomPlaceholderModal("");
        sideMenu.classList.remove("open");
      });
    }
    if (menuSettings) {
      menuSettings.addEventListener("click", function (e) {
        e.preventDefault();
        window.Modal.showModal("settingsModal");
        window.Modal.updatePlaceholderOptions();
        sideMenu.classList.remove("open");
      });
    }
    if (menuGeneral) {
      menuGeneral.addEventListener("click", function (e) {
        e.preventDefault();
        window.Modal.showModal("generalModal");
        sideMenu.classList.remove("open");
      });
    }
    if (menuHelp) {
      menuHelp.addEventListener("click", function (e) {
        e.preventDefault();
        window.Modal.showModal("helpModal");
        sideMenu.classList.remove("open");
      });
    }
    if (menuMapping) {
      menuMapping.addEventListener("click", function (e) {
        e.preventDefault();
        updateMappingModal();
        window.Modal.showModal("mappingModal");
        sideMenu.classList.remove("open");
      });
    }
    if (menuDownload) {
      menuDownload.addEventListener("click", async function (e) {
        e.preventDefault();
        const configBlock = `<!-- CONFIG-START -->
<script>
  window.AppConfig = ${JSON.stringify(window.Config.config, null, 2)};
</script>
<!-- CONFIG-END -->`;
        let finalHtml = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
        finalHtml = finalHtml.replace(/<!--\s*CONFIG-START[\s\S]*?CONFIG-END\s*-->/, configBlock);
        if (window.showSaveFilePicker) {
          try {
            const opts = {
              types: [{
                description: "HTML Files",
                accept: { "text/html": [".html"] }
              }]
            };
            const handle = await window.showSaveFilePicker(opts);
            const writable = await handle.createWritable();
            await writable.write(finalHtml);
            await writable.close();
          } catch (err) {
            console.error("Save cancelled", err);
          }
        } else {
          const blob = new Blob([finalHtml], { type: "text/html" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "programm.html";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
        sideMenu.classList.remove("open");
      });
    }

    // -----------------------------
    // Mapping Modal Update
    // -----------------------------
    window.updateMappingModal = function () {
      const container = document.getElementById("mappingModalContent");
      const mapping = window.anonymizer.getMapping();
      let html = "<table style='width: 100%; border-collapse: collapse;'>";
      html += "<thead><tr style='border-bottom: 1px solid #ccc;'><th style='text-align:left; padding: 4px;'>Original</th><th style='text-align:left; padding: 4px;'>Token</th><th style='text-align:left; padding: 4px;'>Typ</th></tr></thead>";
      html += "<tbody>";
      mapping.forEach(entry => {
        const original = entry[0];
        const token = entry[1] === null ? "null" : entry[1];
        const type = entry[2].placeholderPrefix;
        html += `<tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 4px;">${Utils.escapeHtml(original)}</td>
                    <td style="padding: 4px;">${Utils.escapeHtml(token)}</td>
                    <td style="padding: 4px;">${Utils.escapeHtml(type)}</td>
                 </tr>`;
      });
      html += "</tbody></table>";
      container.innerHTML = html;
    };

    // -----------------------------
    // Context Menu: Managed exclusively in contextMenu.js.
    // Initialize the context menu.
    if (window.ContextMenu && typeof window.ContextMenu.init === "function") {
      window.ContextMenu.init("editor", "contextMenu");
    }

    // -----------------------------
    // Highlight and Editor Management
    // -----------------------------
    const editor = document.getElementById("editor");
    const highlight = document.getElementById("highlight");
    function updateHighlight() {
      const text = editor.value;
      if (text.trim() === "") {
        highlight.innerHTML = `<span class="placeholder">${editor.placeholder}</span>`;
        highlight.className = "";
        return;
      }

      let intervals = [];
      // Collect intervals for detected PII and placeholders.
      let detectedIntervals = Utils.collectIntervals(text, window.anonymizer.getMapping().map(entry => entry[0]), "detected");
      detectedIntervals = Utils.mergeOverlappingIntervals(detectedIntervals);
      intervals = intervals.concat(detectedIntervals);
      intervals = intervals.concat(Utils.collectIntervals(text, window.anonymizer.getMapping().map(entry => entry[1]), "anonymized"));

      // Add whitelist intervals.
      const whitelistItems = window.anonymizer.whitelist.filter(item => item.trim() !== "");
      intervals = intervals.concat(Utils.collectIntervals(text, whitelistItems, "whitelisted"));

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

      // Set highlight classes.
      if (window.anonymizer.getMapping().some(entry => text.indexOf(entry[0]) !== -1)) {
        highlight.classList.add("highlight-detected");
        highlight.classList.remove("highlight-clean");
      } else {
        highlight.classList.add("highlight-clean");
        highlight.classList.remove("highlight-detected");
      }
      highlight.style.height = editor.scrollHeight + "px";
    }
    editor.addEventListener("input", function () {
      updateHighlight();
    });
    editor.addEventListener("scroll", function () {
      highlight.style.transform = `translate(-${editor.scrollLeft}px, -${editor.scrollTop}px)`;
    });
    updateHighlight();
  });
})(window);
