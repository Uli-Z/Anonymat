"use strict";

(function (window) {
  const ContextMenu = {
    lastSelectionRange: { start: 0, end: 0 },

    // Clears the selection by moving the cursor to the end of the last selection range.
    clearSelection(editor) {
      editor.setSelectionRange(this.lastSelectionRange.end, this.lastSelectionRange.end);
    },

    // Retrieves clickable elements (whitelist entries and placeholders) found in the given selection.
    async getClickableElementsInSelection(selection) {
      const whitelistFound = window.anonymizer.whitelist.filter(wl =>
        wl.trim() !== "" && selection.indexOf(wl) !== -1
      );
      const mapping = window.anonymizer.getMapping();
      const placeholderFound = {};
      mapping.forEach(entry => {
        if (entry[0] && selection.indexOf(entry[0]) !== -1) {
          placeholderFound[entry[2].placeholderPrefix] = entry[2];
        }
        if (entry[1] && selection.indexOf(entry[1]) !== -1) {
          placeholderFound[entry[2].placeholderPrefix] = entry[2];
        }
      });
      return { whitelist: [...new Set(whitelistFound)], placeholder: placeholderFound };
    },

    // Retrieves positions of candidate clickable elements in the editor text.
    async getClickableCandidatePositions(editor) {
      const text = editor.value;
      const positions = [];
      const mapping = window.anonymizer.getMapping();
      mapping.forEach(entry => {
        if (entry[0]) {
          let index = text.indexOf(entry[0]);
          while (index !== -1) {
            positions.push({ candidate: entry[0], start: index, end: index + entry[0].length });
            index = text.indexOf(entry[0], index + 1);
          }
        }
        if (entry[1]) {
          let index = text.indexOf(entry[1]);
          while (index !== -1) {
            positions.push({ candidate: entry[1], start: index, end: index + entry[1].length });
            index = text.indexOf(entry[1], index + 1);
          }
        }
      });
      window.anonymizer.whitelist.forEach(wl => {
        if (wl.trim() !== "") {
          let index = text.indexOf(wl);
          while (index !== -1) {
            positions.push({ candidate: wl, start: index, end: index + wl.length });
            index = text.indexOf(wl, index + 1);
          }
        }
      });
      return positions;
    },

    // Adjusts the selection to include entire clickable elements.
    async adjustSelectionToClickableElements(editor) {
      const text = editor.value;
      let start = editor.selectionStart;
      let end = editor.selectionEnd;
      const positions = await this.getClickableCandidatePositions(editor);
      positions.forEach(pos => {
        if (text.substring(start, end).indexOf(pos.candidate) !== -1) {
          start = Math.min(start, pos.start);
          end = Math.max(end, pos.end);
        }
      });
      return { start, end };
    },

    // Updates the last selection range to include full clickable elements.
    async updateLastSelectionRange(editor) {
      if (editor.selectionEnd - editor.selectionStart > 0) {
        const adjusted = await this.adjustSelectionToClickableElements(editor);
        editor.setSelectionRange(adjusted.start, adjusted.end);
        this.lastSelectionRange = { start: adjusted.start, end: adjusted.end };
      }
    },

    // Builds the context menu based on the current text selection.
    // Adds buttons for:
    //   - Batch anonymization (if any unmasked PII is present)
    //   - Batch deanonymization (if any masked tokens are present)
    //   - "Never anonymize" (always shown if selection is non-empty)
    //   - "Add placeholder" (only if no token is contained in the selection)
    //   - "Remove/Disable placeholder" for each active placeholder found in the selection.
    //     If a placeholder token is present in the selection, it will be deanonymized first.
    //   - Whitelist options if present.
    async buildContextMenuAsync(editor, contextMenu, e) {
      let selStart = editor.selectionStart;
      let selEnd = editor.selectionEnd;
      let selection = editor.value.substring(selStart, selEnd).trim();
      if (!selection) {
        selection = editor.value.substring(this.lastSelectionRange.start, this.lastSelectionRange.end).trim();
      }
      
      // Get whitelist and placeholder information
      const clickable = await this.getClickableElementsInSelection(selection);
      const whitelistFound = clickable.whitelist;
      const placeholderFound = clickable.placeholder;
      contextMenu.innerHTML = "";

      const mapping = window.anonymizer.getMapping();
      // Unmasked (original) entries indicate PII that can be anonymized.
      const anonymizableEntries = mapping.filter(entry => entry[0] && selection.indexOf(entry[0]) !== -1);
      // Masked tokens indicate deanonymizable entries.
      const deanonymizableEntries = mapping.filter(entry => entry[1] && selection.indexOf(entry[1]) !== -1);

      // "Never anonymize" button (always if selection is non-empty)
      if (selection.length > 0) {
        const btnNeverAnonymize = Utils.createButton(
          "⛔ " + window.translate("contextMenu.neverAnonymize"),
          ev => {
            ev.preventDefault();
            editor.focus();
            editor.setSelectionRange(this.lastSelectionRange.start, this.lastSelectionRange.end);
            window.anonymizer.addToWhitelist(selection);
            editor.dispatchEvent(new Event("input"));
            contextMenu.style.display = "none";
            this.clearSelection(editor);
          }
        );
        contextMenu.appendChild(btnNeverAnonymize);
      }

      // Batch anonymization button (if there are any unmasked PII entries)
      if (anonymizableEntries.length > 0) {
        const uniqueOriginals = [...new Set(anonymizableEntries.map(entry => entry[0]))];
        const btnBatchAnonymize = Utils.createButton(
          "🛡️ " + window.translate("contextMenu.anonymizeSelection", [uniqueOriginals.length]),
          ev => {
            ev.preventDefault();
            editor.focus();
            editor.setSelectionRange(this.lastSelectionRange.start, this.lastSelectionRange.end);
            uniqueOriginals.forEach(original => {
              window.anonymizer.anonymizeSingleText(original);
            });
            editor.value = window.anonymizer.getText();
            editor.dispatchEvent(new Event("input"));
            contextMenu.style.display = "none";
            this.clearSelection(editor);
          }
        );
        contextMenu.appendChild(btnBatchAnonymize);
      }

      // Batch deanonymization button (if there are any masked tokens)
      if (deanonymizableEntries.length > 0) {
        const uniqueTokens = [...new Set(deanonymizableEntries.map(entry => entry[1]))];
        const btnBatchDeanonymize = Utils.createButton(
          "👀 " + window.translate("contextMenu.unmaskSelection") + (uniqueTokens.length > 1 ? " (" + uniqueTokens.length + ")" : ""),
          ev => {
            ev.preventDefault();
            editor.focus();
            editor.setSelectionRange(this.lastSelectionRange.start, this.lastSelectionRange.end);
            uniqueTokens.forEach(token => {
              window.anonymizer.deanonymizeSingleToken(token);
            });
            editor.value = window.anonymizer.getText();
            editor.dispatchEvent(new Event("input"));
            contextMenu.style.display = "none";
            this.clearSelection(editor);
          }
        );
        contextMenu.appendChild(btnBatchDeanonymize);
      }

      // "Add placeholder" button (if no deanonymizable token is contained in the selection)
      if (deanonymizableEntries.length === 0) {
        const btnAddPlaceholder = Utils.createButton(
          "➕ " + window.translate("contextMenu.addPlaceholder"),
          ev => {
            ev.preventDefault();
            editor.focus();
            editor.setSelectionRange(this.lastSelectionRange.start, this.lastSelectionRange.end);
            const selectedText = editor.value.substring(this.lastSelectionRange.start, this.lastSelectionRange.end).trim();
            window.Modal.openCustomPlaceholderModal(selectedText);
            contextMenu.style.display = "none";
            this.clearSelection(editor);
          }
        );
        contextMenu.appendChild(btnAddPlaceholder);
      }

      // "Remove/Disable placeholder" button for each active placeholder in the selection.
      // If a placeholder token is present in the selection, deanonymize it first.
      Object.keys(placeholderFound).forEach(prefix => {
        const placeholderType = placeholderFound[prefix];
        if (placeholderType.enabled) { // Only if the placeholder is active
          const btnRemovePlaceholder = Utils.createButton(
            "❌ " + window.translate("contextMenu.removePlaceholder", [placeholderType.placeholderPrefix]),
            ev => {
              ev.preventDefault();
              editor.focus();
              // Deanonymize all tokens in the selection for this placeholder type, if present.
              const tokensToDeanonymize = mapping
                .filter(entry => entry[2].id === placeholderType.id && entry[1] && selection.indexOf(entry[1]) !== -1)
                .map(entry => entry[1]);
              tokensToDeanonymize.forEach(token => {
                window.anonymizer.deanonymizeSingleToken(token);
              });
              // Then disable the placeholder type.
              window.anonymizer.setPlaceholderStatus(placeholderType.id, false);
              editor.dispatchEvent(new Event("input"));
              contextMenu.style.display = "none";
              this.clearSelection(editor);
            }
          );
          contextMenu.appendChild(btnRemovePlaceholder);
        }
      });

      // Whitelist options: if there are whitelist matches, add options to remove them.
      if (whitelistFound.length > 0) {
        if (whitelistFound.length > 3) {
          const btn = Utils.createButton(
            window.translate("contextMenu.makeWholeTextAnonymizable"),
            ev => {
              ev.preventDefault();
              editor.focus();
              whitelistFound.forEach(wl => window.anonymizer.removeFromWhitelist(wl));
              editor.dispatchEvent(new Event("input"));
              contextMenu.style.display = "none";
              this.clearSelection(editor);
            }
          );
          contextMenu.appendChild(btn);
        } else {
          whitelistFound.forEach(wl => {
            const displayText = wl.length > 50 ? wl.slice(0, 50) + "..." : wl;
            const btn = Utils.createButton(
              window.translate("contextMenu.makeTextAnonymizable", [displayText]),
              ev => {
                ev.preventDefault();
                editor.focus();
                window.anonymizer.removeFromWhitelist(wl);
                editor.dispatchEvent(new Event("input"));
                contextMenu.style.display = "none";
                this.clearSelection(editor);
              }
            );
            contextMenu.appendChild(btn);
          });
        }
      }
    },

    // Displays the context menu at an appropriate position based on the event.
    async showContextMenu(editor, contextMenu, e) {
      if ((editor.selectionEnd - editor.selectionStart >= 1) || this.lastSelectionRange.end > this.lastSelectionRange.start) {
        await this.buildContextMenuAsync(editor, contextMenu, e);
        const menuWidth = contextMenu.offsetWidth;
        const menuHeight = contextMenu.offsetHeight;
        let posX = e.clientX - menuWidth / 2;
        let posY = e.clientY + 10;
        if (posX < 0) posX = 0;
        if (posX + menuWidth > window.innerWidth) posX = window.innerWidth - menuWidth;
        if (posY + menuHeight > window.innerHeight) {
          posY = e.clientY - menuHeight - 10;
          if (posY < 0) posY = 0;
        }
        contextMenu.style.left = posX + "px";
        contextMenu.style.top = posY + "px";
        contextMenu.style.display = "flex";
      } else {
        contextMenu.style.display = "none";
      }
    },

    // Handles clicks within the editor to display the context menu if a clickable candidate is found.
    async handleEditorClick(editor, contextMenu, e) {
      if (editor.selectionStart === editor.selectionEnd) {
        if (editor.selectionStart === editor.value.length) {
          contextMenu.style.display = "none";
          return;
        }
        const caretPos = editor.selectionStart;
        const text = editor.value;
        let foundMatch = null;
        const positions = await this.getClickableCandidatePositions(editor);
        for (let pos of positions) {
          if (caretPos >= pos.start && caretPos <= pos.end) {
            foundMatch = { start: pos.start, end: pos.end };
            break;
          }
        }
        if (foundMatch) {
          editor.selectionStart = foundMatch.start;
          editor.selectionEnd = foundMatch.end;
          this.lastSelectionRange = { start: foundMatch.start, end: foundMatch.end };
          await this.showContextMenu(editor, contextMenu, e);
        }
      }
    },

    // Registers event listeners for the editor and document to handle context menu display.
    registerEventListeners(editor, contextMenu) {
      editor.addEventListener("mouseup", async e => {
        await this.updateLastSelectionRange(editor);
        setTimeout(async () => {
          if (editor.selectionEnd - editor.selectionStart >= 1) {
            await this.showContextMenu(editor, contextMenu, e);
          }
        }, 0);
      });

      editor.addEventListener("keyup", async () => {
        await this.updateLastSelectionRange(editor);
        setTimeout(() => {
          if (editor.selectionEnd - editor.selectionStart < 1) {
            contextMenu.style.display = "none";
          }
        }, 0);
      });

      editor.addEventListener("click", async e => {
        await this.handleEditorClick(editor, contextMenu, e);
      });

      document.addEventListener("click", e => {
        if (!e.target.closest("#contextMenu") && e.target.id !== "editor") {
          contextMenu.style.display = "none";
        }
      });
    },

    // Initializes the context menu by registering the event listeners.
    init(editorId, contextMenuId) {
      const editor = document.getElementById(editorId);
      const contextMenu = document.getElementById(contextMenuId);
      if (!editor || !contextMenu) return;
      this.registerEventListeners(editor, contextMenu);
    }
  };

  window.ContextMenu = ContextMenu;
})(window);
