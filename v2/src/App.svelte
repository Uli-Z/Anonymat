<script lang="ts">
  import { detectPII, mergeManual, KIND_LABELS, type Finding, type Kind } from './lib/detect';
  import { maskText, restoreText, splitForPreview } from './lib/replace';

  const kinds: Kind[] = ['PERSON', 'EMAIL', 'PHONE', 'IBAN', 'OTHER'];

  let source = $state('');
  let manual = $state<Finding[]>([]);
  let decisions = $state<Record<string, boolean>>({});
  let selectedKind = $state<Kind>('PERSON');
  let reply = $state('');
  let notice = $state('');
  let editor: HTMLTextAreaElement;
  let manualCounter = 0;

  let findings = $derived(mergeManual(detectPII(source), manual));
  let approved = $derived(findings.filter(item => decisions[item.id] !== false));
  let prepared = $derived(maskText(source, approved));
  let preview = $derived(splitForPreview(prepared.text));
  let restored = $derived(restoreText(reply, prepared.mapping));

  function onSourceChange(event: Event): void {
    source = (event.currentTarget as HTMLTextAreaElement).value;
    // Text offsets change on editing. Never apply a stale manual selection.
    manual = [];
    decisions = {};
    reply = '';
    notice = '';
  }

  function addManual(): void {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    if (start === end) {
      notice = 'Markiere zunächst einen Textbereich im Original.';
      editor.focus();
      return;
    }
    const value = source.slice(start, end);
    manualCounter += 1;
    manual = [...manual, {
      id: 'manual-' + manualCounter,
      origin: 'manual',
      kind: selectedKind,
      text: value,
      start,
      end
    }];
    notice = 'Manuelle Markierung übernommen.';
  }

  function toggle(id: string, allowed: boolean): void {
    decisions = { ...decisions, [id]: allowed };
  }

  function resetAll(): void {
    source = '';
    manual = [];
    decisions = {};
    reply = '';
    notice = '';
    editor?.focus();
  }

  async function copy(value: string, label: string): Promise<void> {
    if (!value.trim()) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const field = document.createElement('textarea');
        field.value = value;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        const success = document.execCommand('copy');
        field.remove();
        if (!success) throw new Error('copy failed');
      }
      notice = label + ' kopiert.';
    } catch {
      notice = 'Automatisches Kopieren nicht verfügbar. Text bitte manuell auswählen.';
    }
  }
</script>

<svelte:head>
  <title>Anonymat 2.0 · Lokale Pseudonymisierung</title>
</svelte:head>

<div class="app-shell">
  <header class="topbar">
    <div class="brand">
      <div class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
          <path d="M12 2.5 20 6v5.5c0 5.2-3.3 8.5-8 10-4.7-1.5-8-4.8-8-10V6l8-3.5Z"/>
          <path d="m8.5 12 2.3 2.3 4.8-4.8" stroke-linecap="round"/>
        </svg>
      </div>
      <div>
        <div class="brand-name">Anonymat <span class="version">2.0 Alpha</span></div>
        <div class="brand-subtitle">Texte lokal pseudonymisieren</div>
      </div>
    </div>
    <div class="topbar-actions">
      <span class="offline-indicator"><span class="status-dot"></span> Offline · Verarbeitung im Browser</span>
      <a class="github-link" href="https://github.com/Uli-Z/Anonymat" target="_blank" rel="noopener noreferrer">GitHub <span aria-hidden="true">↗</span></a>
    </div>
  </header>

  <main class="main-content">
    <div class="page-heading">
      <div>
        <div class="eyebrow">ARBEITSPLATZ</div>
        <h1>Vertrauliche Texte sicher vorbereiten.</h1>
        <p>Informationen erkennen, ergänzen und vor der Verarbeitung durch KI als Platzhalter maskieren.</p>
      </div>
      <button class="reset-button" type="button" onclick={resetAll} disabled={!source && !reply}>↺ <span>Neuer Text</span></button>
    </div>

    <div class="step-heading">
      <div class="step-number">1</div>
      <div>
        <h2>Text vorbereiten</h2>
        <p>Automatische Treffer sind Vorschläge. Lies den gesamten Text vor dem Kopieren aufmerksam durch.</p>
      </div>
    </div>

    <div class="workspace-grid">
      <section class="panel editor-panel" aria-labelledby="source-title">
        <div class="panel-heading">
          <div>
            <h3 id="source-title">Originaltext</h3>
            <p>Text hier eingeben oder einfügen</p>
          </div>
          <span class="quiet-count">{source.length.toLocaleString('de-DE')} Zeichen</span>
        </div>
        <textarea
          class="source-editor"
          bind:this={editor}
          value={source}
          oninput={onSourceChange}
          spellcheck="false"
          placeholder="Beispiel: Frau Anna Müller, E-Mail: anna.mueller@example.org, Telefon: +49 421 12345678 ..."
          aria-label="Originaltext"
        ></textarea>
        <div class="selection-toolbar">
          <div class="selection-help">Text markieren und als Platzhalter übernehmen:</div>
          <div class="selection-actions">
            <select bind:value={selectedKind} aria-label="Kategorie für manuelle Markierung">
              {#each kinds as kind}
                <option value={kind}>{KIND_LABELS[kind]}</option>
              {/each}
            </select>
            <button type="button" class="small-primary" onclick={addManual} disabled={!source.trim()}>+ Markieren</button>
          </div>
        </div>
      </section>

      <section class="panel findings-panel" aria-labelledby="findings-title">
        <div class="panel-heading">
          <div>
            <h3 id="findings-title">Erkannte Angaben</h3>
            <p>Treffer prüfen und bei Bedarf abwählen</p>
          </div>
          <span class="count-badge">{findings.length}</span>
        </div>
        <div class="findings-body">
          {#if findings.length === 0}
            <div class="empty-state">
              <div class="empty-symbol" aria-hidden="true">⌕</div>
              <strong>Noch keine Treffer</strong>
              <p>Füge links einen Text ein oder markiere eine sensible Stelle selbst.</p>
            </div>
          {:else}
            <div class="list-caption">{approved.length} von {findings.length} Treffern aktiviert</div>
            <div class="findings-list">
              {#each findings as finding (finding.id)}
                <label class="finding-row">
                  <input
                    type="checkbox"
                    checked={decisions[finding.id] !== false}
                    onchange={event => toggle(finding.id, event.currentTarget.checked)}
                  />
                  <span class="finding-details">
                    <span class="finding-value">{finding.text}</span>
                    <span class="finding-meta">{KIND_LABELS[finding.kind]} · {finding.origin === 'manual' ? 'Manuell' : 'Automatisch'}</span>
                  </span>
                </label>
              {/each}
            </div>
          {/if}
        </div>
      </section>
    </div>

    <section class="panel output-panel" aria-labelledby="result-title">
      <div class="panel-heading">
        <div>
          <h3 id="result-title">Pseudonymisierter Text</h3>
          <p>Nur diesen überprüften Text an externe KI-Dienste weitergeben</p>
        </div>
        <button class="primary-button" type="button" onclick={() => copy(prepared.text, 'Pseudonymisierter Text')} disabled={!source.trim()}>
          <span aria-hidden="true">⧉</span> Text kopieren
        </button>
      </div>
      <div class="preview" aria-live="polite">
        {#if source.trim()}
          {#each preview as part}
            {#if part.token}<span class="placeholder-token">{part.value}</span>{:else}{part.value}{/if}
          {/each}
        {:else}
          <span class="preview-empty">Hier erscheint die Vorschau mit den ersetzten Angaben.</span>
        {/if}
      </div>
      {#if source.trim() && prepared.mapping.length === 0}
        <div class="inline-warning">Es sind keine Angaben markiert. Bitte prüfe den Originaltext, bevor du ihn weitergibst.</div>
      {/if}
    </section>

    <div class="step-heading second-step">
      <div class="step-number">2</div>
      <div>
        <h2>KI-Ergebnis zurückübersetzen</h2>
        <p>Füge den bearbeiteten oder übersetzten Text ein. Die Platzhalter werden ausschließlich lokal wiederhergestellt.</p>
      </div>
    </div>

    <div class="restore-grid">
      <section class="panel" aria-labelledby="reply-title">
        <div class="panel-heading">
          <div><h3 id="reply-title">Antwort der KI</h3><p>Text mit Platzhaltern hier einfügen</p></div>
        </div>
        <textarea
          class="reply-editor"
          bind:value={reply}
          spellcheck="false"
          placeholder="Hier die Antwort von ChatGPT oder einem anderen Tool mit [PERSON_001] usw. einfügen ..."
          aria-label="KI-Antwort mit Platzhaltern"
        ></textarea>
      </section>
      <section class="panel" aria-labelledby="restored-title">
        <div class="panel-heading">
          <div><h3 id="restored-title">Wiederhergestellter Text</h3><p>Originalangaben lokal eingesetzt</p></div>
          <button class="secondary-button" type="button" disabled={!reply.trim()} onclick={() => copy(restored.text, 'Wiederhergestellter Text')}>⧉ Kopieren</button>
        </div>
        <div class="restore-preview">{#if reply.trim()}{restored.text}{:else}<span class="preview-empty">Die Rückübersetzung wird hier angezeigt.</span>{/if}</div>
        {#if reply.trim() && (restored.missing.length || restored.unknown.length)}
          <div class="inline-warning">
            {#if restored.missing.length}Nicht wiedergefunden: {restored.missing.join(', ')}. {/if}
            {#if restored.unknown.length}Unbekannte Tokens: {restored.unknown.join(', ')}.{/if}
            Bitte das Ergebnis prüfen.
          </div>
        {/if}
      </section>
    </div>

    <div class="footer-note">
      <span class="footer-note-icon" aria-hidden="true">ⓘ</span>
      <span>Prototyp: zunächst einfache Muster und Namensanreden. Die Erkennung ist unvollständig, ersetzt keine manuelle Kontrolle und gewährleistet keine Anonymität. Es werden keine Texte gespeichert oder versendet. Datumsverschiebung und Wortlisten folgen.</span>
    </div>
    {#if notice}<div class="toast" role="status">{notice}</div>{/if}
  </main>
  <footer class="site-footer"><span>Anonymat 2.0 · Lokales Werkzeug · Open Source</span><span>Alpha – nicht für ungeprüfte vertrauliche Dokumente verwenden</span></footer>
</div>
