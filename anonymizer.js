"use strict";

(function (window) {
  // Simple text wrapper with change notification.
  class TextWrapper {
    constructor(initialText = "") {
      this.text = initialText;
      this._onTextChange = null;
    }
    get() {
      return this.text;
    }
    set(newText) {
      this.text = newText;
      if (this._onTextChange) {
        this._onTextChange(newText);
      }
    }
    setOnTextChange(callback) {
      this._onTextChange = callback;
    }
  }

  class Anonymizer {
    constructor(initialText = "") {
      this.textWrapper = new TextWrapper(initialText);
      // List of placeholder types (classes from placeholder.js)
      this.placeholderTypes = [
        new IBANPlaceholderType(),
        new EmailPlaceholderType(),
        new DateTimePlaceholderType(),
        new URLPlaceholderType(),
        new CreditCardPlaceholderType(),
        new SocialSecurityPlaceholderType(),
        new PhonePlaceholderType(),
        new NumberPlaceholderType(),
        new NamePlaceholderType(),
        new DatePlaceholderType()
      ];
      this.whitelist = [];
      this._wlMapping = {};
      this._wlCounter = 1;
      this.scanCompleted = false;
      // Mapping entries: [original, token, placeholder instance, rank]
      this.mapping = [];
      this._abortController = null;

      // Callback properties
      this._onProgress = null;
      this._onMappingChange = null;
      this._onComplete = null;
      this._onAbort = null;
      this._onTextChange = null;

      this.textWrapper.setOnTextChange(() => this._triggerTextChange());
    }

    // Callback setters
    setOnProgress(callback) { this._onProgress = callback; }
    setOnMappingChange(callback) { this._onMappingChange = callback; }
    setOnComplete(callback) { this._onComplete = callback; }
    setOnAbort(callback) { this._onAbort = callback; }
    setOnTextChange(callback) { this._onTextChange = callback; }

    // Internal callback triggers
    _triggerProgress(percent, message) {
      if (this._onProgress) this._onProgress(percent, message);
    }
    _triggerMappingChange() {
      if (this._onMappingChange) this._onMappingChange();
    }
    _triggerComplete(mapping) {
      if (this._onComplete) this._onComplete(mapping);
    }
    _triggerAbort() {
      if (this._onAbort) this._onAbort();
    }
    _triggerTextChange() {
      if (this._onTextChange) this._onTextChange();
    }

    // Set text after applying whitelist and cleaning mapping list.
    setText(newText = "") {
      const processedText = this._applyWhitelist(newText);
      this.textWrapper.set(processedText);
      this.cleanMappingList();
    }

    // Replace whitelist items with tokens to avoid anonymizing them.
    _applyWhitelist(newText) {
      this._wlMapping = {};
      this._wlCounter = 1;
      // Sort whitelist items by length descending.
      const sortedWL = [...this.whitelist].sort((a, b) => b.length - a.length);
      sortedWL.forEach(wl => {
        const token = `[!WL!${this._wlCounter++}]`;
        const escaped = window.Utils.escapeRegExp(wl);
        newText = newText.replace(new RegExp(escaped, "g"), token);
        this._wlMapping[token] = wl;
      });
      return newText;
    }

    // Restore whitelist tokens to their original values.
    _restoreWhitelist(text) {
      for (const token in this._wlMapping) {
        const wlValue = this._wlMapping[token];
        text = text.replace(new RegExp(window.Utils.escapeRegExp(token), "g"), wlValue);
      }
      return text;
    }

    // Scan the text for sensitive data and update the mapping.
    async identifyPII() {
      if (this._abortController) {
        this._abortController.abort();
        this._triggerAbort();
      }
      this._abortController = new AbortController();
      const signal = this._abortController.signal;
      this.scanCompleted = false;
      const originalText = this.textWrapper.get();
      const activePlaceholders = this.placeholderTypes.filter(ph => ph.enabled)
                                  .sort((a, b) => (a.rank || 0) - (b.rank || 0));
      for (let i = 0; i < activePlaceholders.length; i++) {
        if (signal.aborted) return;
        const ph = activePlaceholders[i];
        const percent = Math.round(((i + 1) / activePlaceholders.length) * 100);
        this._triggerProgress(percent, `Scanning for ${ph.placeholderPrefix}...`);
        const results = ph.identifyPII(originalText, this.mapping) || [];
        results.forEach(entry => {
          this.addToMappingList(entry[0], entry[1], entry[2], ph.rank);
        });
      }
      this.cleanMappingList();
      this._triggerComplete(this.mapping);
      this.scanCompleted = true;
      this._abortController = null;
      console.log("PII identification completed.");
    }

    // Add a new mapping entry.
    // This function now removes any existing mapping entries with the same original text
    // before adding the new one.
    addToMappingList(original, token, placeholder, rank) {
      // Remove all entries with the same original text
      this.mapping = this.mapping.filter(entry => entry[0] !== original);
      // Add the new mapping entry
      this.mapping.push([original, token, placeholder, rank]);
      this._triggerMappingChange();
    }

    // Simulate anonymization to assign tokens.
    _applyAnonymization(text, mappingList) {
      let modifiedText = text;
      const updatedMappingList = mappingList.map(entry => [...entry]);
      updatedMappingList.sort((a, b) => {
        if (a[3] === b[3]) {
          return b[0].length - a[0].length;
        }
        return a[3] - b[3];
      });
      updatedMappingList.forEach(entry => {
        const [original, token, placeholder] = entry;
        const regex = new RegExp(window.Utils.escapeRegExp(original), "g");
        if (regex.test(modifiedText)) {
          if (token === null) {
            entry[1] = placeholder.getNextTokenName(updatedMappingList);
          }
          modifiedText = modifiedText.replace(regex, entry[1]);
        }
      });
      return { modifiedText, updatedMappingList };
    }

    // Replace sensitive data with tokens.
    async anonymize() {
      if (!this.scanCompleted) {
        await this.identifyPII();
      }
      const { modifiedText, updatedMappingList } =
        this._applyAnonymization(this.textWrapper.get(), this.mapping);
      this.mapping = updatedMappingList;
      this.setText(modifiedText);
      return this.textWrapper.get();
    }

    // Replace tokens with original sensitive data.
    deanonymize() {
      let text = this.textWrapper.get();
      this.mapping.forEach(entry => {
        if (entry[1] !== null) {
          text = text.replace(new RegExp(window.Utils.escapeRegExp(entry[1]), "g"), entry[0]);
        }
      });
      this.setText(text);
      return this.textWrapper.get();
    }

    // Return final text with whitelist restored.
    getText() {
      return this._restoreWhitelist(this.textWrapper.get());
    }

    clearMapping() {
      this.mapping = [];
      this._triggerMappingChange();
    }

    getMapping() {
      return this.mapping;
    }

    // Clean mapping list by removing invalid entries.
    cleanMappingList() {
      const { updatedMappingList } = this._applyAnonymization(this.textWrapper.get(), this.mapping);
      this.mapping = this.mapping.filter(entry => {
        if (!entry[2].enabled) return false;
        if (entry[1] !== null) return true;
        return updatedMappingList.some(simEntry =>
          simEntry[0] === entry[0] &&
          simEntry[2] === entry[2] &&
          simEntry[1] !== null
        );
      });
      this._triggerMappingChange();
    }

    // Helper to escape regex characters.
    _escapeRegExp(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    addToWhitelist(item) {
      if (!this.whitelist.includes(item)) {
        this.whitelist.push(item);
        this.setText(this.getText());
        this.identifyPII();
      }
    }

    removeFromWhitelist(item) {
      this.whitelist = this.whitelist.filter(wl => wl !== item);
      this.setText(this.getText());
      this.identifyPII();
    }

    addCustomPlaceholder(label, pattern, direct = false) {
      let uniqueLabel;
      if (this.placeholderTypes.some(ph => ph.placeholderPrefix === label)) {
        let counter = 1;
        uniqueLabel = label + counter;
        while (this.placeholderTypes.some(ph => ph.placeholderPrefix === uniqueLabel)) {
          counter++;
          uniqueLabel = label + counter;
        }
      } else {
        uniqueLabel = label;
      }
      const customPlaceholder = new CustomPlaceholderType(pattern, uniqueLabel);
      this.placeholderTypes.push(customPlaceholder);

      // Scan only using the custom placeholder and update the mapping.
      const currentText = this.textWrapper.get();
      const results = customPlaceholder.identifyPII(currentText, this.mapping) || [];
      results.forEach(entry => {
        // entry corresponds to [match, null, customPlaceholder, ...]
        this.addToMappingList(entry[0], entry[1], customPlaceholder, customPlaceholder.rank);
      });

      if (direct && typeof customPlaceholder.apply === 'function') {
        customPlaceholder.apply();
      }
    }

    getUniqueSecretLabel() {
      let maxNum = 0;
      this.placeholderTypes.forEach(ph => {
        if (ph.placeholderPrefix.startsWith("Secret")) {
          const num = parseInt(ph.placeholderPrefix.slice(6), 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });
      return "Secret" + (maxNum + 1);
    }

    getPlaceholderByID(id) {
      return this.placeholderTypes.find(ph => ph.id === id);
    }

    removePlaceholder(id) {
      const ph = this.getPlaceholderByID(id);
      if (!ph) return;
      let currentText = this.textWrapper.get();
      this.mapping.forEach(entry => {
        if (entry[2].id === ph.id && entry[1] !== null) {
          const regex = new RegExp(this._escapeRegExp(entry[1]), "g");
          currentText = currentText.replace(regex, entry[0]);
        }
      });
      this.mapping = this.mapping.filter(entry => entry[2].id !== ph.id);
      if (ph.isCustom) {
        const index = this.placeholderTypes.findIndex(item => item.id === ph.id);
        if (index !== -1) this.placeholderTypes.splice(index, 1);
      } else {
        ph.enabled = false;
      }
      this.textWrapper.set(currentText);
      this.identifyPII();
    }

    setPlaceholderStatus(id, status) {
      const ph = this.getPlaceholderByID(id);
      if (ph) {
        ph.enabled = status;
        this.identifyPII();
      }
    }
    
    // --- New functions for singular anonymization/deanonymization ---
    
    // Replaces all occurrences of a specific original text (from the mapping list)
    // with its token, performing singular anonymization.
    anonymizeSingleText(originalText) {
      let mappingEntry = this.mapping.find(entry => entry[0] === originalText);
      if (!mappingEntry) return;
      const regex = new RegExp(window.Utils.escapeRegExp(originalText), "g");
      let currentText = this.textWrapper.get();
      if (mappingEntry[1] === null) {
        mappingEntry[1] = mappingEntry[2].getNextTokenName(this.mapping);
      }
      currentText = currentText.replace(regex, mappingEntry[1]);
      this.setText(currentText);
      this._triggerTextChange();
    }
    
    // Replaces in the text the given token with its original text,
    // i.e. singular deanonymization.
    deanonymizeSingleToken(token) {
      let mappingEntry = this.mapping.find(entry => entry[1] === token);
      if (!mappingEntry) return;
      let currentText = this.textWrapper.get();
      const regex = new RegExp(window.Utils.escapeRegExp(token), "g");
      currentText = currentText.replace(regex, mappingEntry[0]);
      this.setText(currentText);
      this._triggerTextChange();
    }
    
  }

  window.Anonymizer = Anonymizer;
  window.TextWrapper = TextWrapper;
  
  // Compatibility alias for existing calls (e.g., in context menu)
  Anonymizer.prototype.deanonymize_singleToken = Anonymizer.prototype.deanonymizeSingleToken;
  Anonymizer.prototype.anonymize_singleText = Anonymizer.prototype.anonymizeSingleText;
})(window);

window.anonymizer = new Anonymizer();
