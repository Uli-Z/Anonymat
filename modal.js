"use strict";

(function (window) {
  // Show a modal with the given ID.
  function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = "block";
    }
  }

  // Hide a modal with the given ID.
  function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = "none";
    }
  }

  // Opens the custom placeholder modal.
  function openCustomPlaceholderModal(selectedText) {
    const modal = document.getElementById("customPlaceholderModal");
    if (modal) {
      // Zuerst das Modal anzeigen, damit der Fokus korrekt gesetzt werden kann.
      modal.style.display = "block";
      const customPatternInput = modal.querySelector("#customPattern");
      const customLabelInput = modal.querySelector("#customLabel");
      if (customPatternInput) {
        customPatternInput.value = selectedText || "";
      }
      if (customLabelInput && window.anonymizer) {
        customLabelInput.value = window.anonymizer.getUniqueSecretLabel();
        // Mit setTimeout sicherstellen, dass der Fokus gesetzt wird, nachdem das Modal gerendert wurde.
        setTimeout(() => {
          customLabelInput.focus();
          customLabelInput.select();
        }, 0);
      }
    } else {
      console.error("Custom Placeholder Modal not found in DOM.");
    }
  }

  // Sets up event handlers for the custom placeholder modal.
  function setupCustomPlaceholderModal() {
    const modal = document.getElementById("customPlaceholderModal");
    if (!modal) return;
    const saveBtn = document.getElementById("saveCustomPlaceholderBtn");
    const cancelBtn = document.getElementById("cancelCustomPlaceholderBtn");
    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        const pattern = document.getElementById("customPattern").value.trim();
        const label = document.getElementById("customLabel").value.trim();
        if (pattern && label) {
          window.anonymizer.addCustomPlaceholder(label, pattern, false);
          // Nach dem Hinzufügen automatisch anonymisieren
          window.anonymizer.anonymize_singleText(pattern);
          const editor = document.getElementById("editor");
          if (editor) {
            editor.dispatchEvent(new Event("input"));
          }
          modal.style.display = "none";
        } else {
          alert("Bitte fülle beide Felder aus.");
        }
      });
    }
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        modal.style.display = "none";
      });
    }
  }

  // Updates the placeholder settings modal content.
  function updatePlaceholderOptions() {
    const container = document.getElementById("placeholderOptionsContent");
    if (!container) return;
    container.innerHTML = "";

    const mapping = window.anonymizer.getMapping();
    const customPlaceholders = [];
    const activePlaceholders = [];
    const inactivePlaceholders = [];

    window.anonymizer.placeholderTypes.forEach(ph => {
      if (ph.isCustom) {
        customPlaceholders.push(ph);
      } else {
        const isActive = mapping.some(entry => entry[2].id === ph.id);
        if (isActive) {
          activePlaceholders.push(ph);
        } else {
          inactivePlaceholders.push(ph);
        }
      }
    });

    function createPlaceholderCheckbox(ph) {
      const div = document.createElement("div");
      div.className = "placeholder-item";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = ph.enabled;
      checkbox.dataset.placeholderId = ph.id;
      checkbox.classList.add("placeholder-checkbox");
      const label = document.createElement("label");
      label.textContent = ph.placeholderPrefix;
      label.classList.add("placeholder-label");
      div.appendChild(checkbox);
      div.appendChild(label);
      return div;
    }

    // Custom Placeholders Section.
    if (customPlaceholders.length > 0) {
      const customSection = document.createElement("div");
      customSection.classList.add("placeholder-section");
      const headerCustom = document.createElement("h4");
      headerCustom.textContent = window.translate("contextMenu.customPlaceholders") || "Benutzerdefinierte Platzhalter";
      customSection.appendChild(headerCustom);
      const list = document.createElement("div");
      list.classList.add("placeholder-list");
      customPlaceholders.forEach(ph => list.appendChild(createPlaceholderCheckbox(ph)));
      customSection.appendChild(list);
      container.appendChild(customSection);
    }

    // Active Placeholders Section.
    const activeSection = document.createElement("div");
    activeSection.classList.add("placeholder-section");
    const headerActive = document.createElement("h4");
    headerActive.textContent = window.translate("contextMenu.activePlaceholders") || "Aktive Platzhalter";
    activeSection.appendChild(headerActive);
    if (activePlaceholders.length > 0) {
      const list = document.createElement("div");
      list.classList.add("placeholder-list");
      activePlaceholders.forEach(ph => list.appendChild(createPlaceholderCheckbox(ph)));
      activeSection.appendChild(list);
    } else {
      const noActiveMsg = document.createElement("p");
      noActiveMsg.textContent = window.translate("contextMenu.noActivePlaceholders") || "Aktuell keine aktiven Platzhalter.";
      noActiveMsg.classList.add("no-active-placeholders");
      activeSection.appendChild(noActiveMsg);
    }
    container.appendChild(activeSection);

    // Inactive Placeholders Section with Toggle.
    if (inactivePlaceholders.length > 0) {
      const inactiveSection = document.createElement("div");
      inactiveSection.classList.add("placeholder-section");
      const headerInactive = document.createElement("h4");
      headerInactive.textContent = window.translate("contextMenu.additionalPlaceholders") || "Weitere Platzhalter";
      
      // Toggle button.
      const toggleButton = document.createElement("button");
      toggleButton.textContent = window.translate("contextMenu.showAdditionalPlaceholders") || "Anzeigen";
      toggleButton.classList.add("toggle-button");
      headerInactive.appendChild(toggleButton);
      inactiveSection.appendChild(headerInactive);
      
      const inactiveContainer = document.createElement("div");
      inactiveContainer.classList.add("placeholder-list", "inactive-list");
      inactiveContainer.style.display = "none"; // collapsed by default
      inactivePlaceholders.forEach(ph => inactiveContainer.appendChild(createPlaceholderCheckbox(ph)));
      inactiveSection.appendChild(inactiveContainer);
      container.appendChild(inactiveSection);
      
      toggleButton.addEventListener("click", () => {
        if (inactiveContainer.style.display === "none") {
          inactiveContainer.style.display = "block";
          toggleButton.textContent = window.translate("contextMenu.hideAdditionalPlaceholders") || "Ausblenden";
        } else {
          inactiveContainer.style.display = "none";
          toggleButton.textContent = window.translate("contextMenu.showAdditionalPlaceholders") || "Anzeigen";
        }
      });
    }
    
    // Update Button.
    const updateButton = document.createElement("button");
    updateButton.textContent = window.translate("contextMenu.updateStatus") || "Status aktualisieren";
    updateButton.classList.add("update-button");
    updateButton.addEventListener("click", function () {
      const checkboxes = container.querySelectorAll("input[type='checkbox']");
      checkboxes.forEach(cb => {
        const phId = cb.dataset.placeholderId;
        const newStatus = cb.checked;
        window.anonymizer.setPlaceholderStatus(phId, newStatus);
      });
      alert(window.translate("contextMenu.statusUpdated") || "Placeholder-Status aktualisiert.");
    });
    container.appendChild(updateButton);
  }

  // Expose modal functions.
  window.Modal = {
    showModal,
    hideModal,
    openCustomPlaceholderModal,
    setupCustomPlaceholderModal,
    updatePlaceholderOptions
  };

  document.addEventListener("DOMContentLoaded", function() {
    setupCustomPlaceholderModal();
  });

  // Expose updatePlaceholderOptions globally if benötigt.
  window.updatePlaceholderOptions = updatePlaceholderOptions;
})(window);
