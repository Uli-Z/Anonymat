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
      // Updated placeholder types with new EmailPlaceholder integration.
      this.placeholderTypes = [
        new NumberPlaceholder(),       // placeholder for numbers
        new NamePlaceholder(),         // placeholder for names
        new EmailPlaceholder()         // placeholder for emails
      ];
      this.whitelist = [];
      this._wlMapping = {};
      this._wlCounter = 1;
      this.scanCompleted = false;
      // Mapping entries: [original, token, placeholder, rank]
      this.mapping = [];
      this._abortController = null;

      // Callback properties
      this._onProgress = null;
      this._onMappingChange = null;
      this._onComplete = null;
      this._onAbort = null;
      this._onTextChange = null;

      this.textWrapper = new TextWrapper(initialText);
      this.textWrapper.setOnTextChange(() => this._triggerTextChange());
    }

    // Callback setters
    setOnProgress(callback) { this._onProgress = callback; }
    setOnMappingChange(callback) { this._onMappingChange = callback; }
    setOnComplete(callback) { this._onComplete = callback; }
    setOnAbort(callback) { this._onAbort = callback; }
    setOnTextChange(callback) { this._onTextChange = callback; }

    // Trigger progress callback
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

    // Set text and apply whitelist, then clean mapping list.
    setText(newText = "") {
      const processedText = this._applyWhitelist(newText);
      this.textWrapper.set(processedText);
      this.cleanMappingList();
    }

    // Replace whitelist items with tokens.
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

    // Restore whitelist tokens.
    _restoreWhitelist(text) {
      for (const token in this._wlMapping) {
        const wlValue = this._wlMapping[token];
        text = text.replace(new RegExp(window.Utils.escapeRegExp(token), "g"), wlValue);
      }
      return text;
    }

    // Scan text for sensitive data using new detection strategies.
    async identifyPII() {
      if (this._abortController) {
        this._abortController.abort();
        this._triggerAbort();
      }
      this._abortController = new AbortController();
      const signal = this._abortController.signal;
      this.scanCompleted = false;
      const originalText = this.textWrapper.get();
      // Filter active placeholders; assume each has an 'enabled' property (default true).
      const activePlaceholders = this.placeholderTypes.filter(ph => ph.enabled !== false)
                                  .sort((a, b) => (a.rank || 0) - (b.rank || 0));
      for (let i = 0; i < activePlaceholders.length; i++) {
        if (signal.aborted) return;
        const ph = activePlaceholders[i];
        const percent = Math.round(((i + 1) / activePlaceholders.length) * 100);
        this._triggerProgress(percent, `Scanning for ${ph.placeholderPrefix}...`);
        // Use the new detect method from the placeholder.
        const results = ph.detect(originalText, this.mapping) || [];
        results.forEach(result => {
          // Add detection result to mapping list.
          this.addToMappingList(result.original, result.token, ph, ph.rank);
        });
      }
      this.cleanMappingList();
      this._triggerComplete(this.mapping);
      this.scanCompleted = true;
      this._abortController = null;
      console.log("PII identification completed.");
    }

    // Add a new mapping entry. Removes entries with the same original text.
    addToMappingList(original, token, placeholder, rank) {
      this.mapping = this.mapping.filter(entry => entry[0] !== original);
      this.mapping.push([original, token, placeholder, rank]);
      this._triggerMappingChange();
    }

    // Apply anonymization by assigning tokens and replacing sensitive data.
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

    // Clean mapping list by removing invalid or duplicate entries.
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

    // Add item to whitelist and re-run detection.
    addToWhitelist(item) {
      if (!this.whitelist.includes(item)) {
        let currentText = this.textWrapper.get();
        const regex = new RegExp(this._escapeRegExp(item), "g");
        const matches = currentText.match(regex);
        if (matches) {
          matches.forEach(match => {
            const regex = new RegExp(this._escapeRegExp(match), "g");
            const mappingEntry = this.mapping.find(entry => entry[1] === match);
            if (mappingEntry) {
              const originalText = mappingEntry[0];
              currentText = currentText.replace(regex, originalText);
              item = currentText;
            }
          });
        }
        this.textWrapper.set(currentText);

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

      const currentText = this.textWrapper.get();
      const results = customPlaceholder.identifyPII
                        ? customPlaceholder.identifyPII(currentText, this.mapping) || []
                        : [];
      results.forEach(entry => {
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
    
    // Singular anonymization: replace all occurrences of a specific original text.
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
    
    // Singular deanonymization: replace a specific token with its original text.
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
  
  // Compatibility alias for existing calls.
  Anonymizer.prototype.deanonymize_singleToken = Anonymizer.prototype.deanonymizeSingleToken;
  Anonymizer.prototype.anonymize_singleText = Anonymizer.prototype.anonymizeSingleText;
})(window);

window.anonymizer = new Anonymizer();
