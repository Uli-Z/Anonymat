<script lang="ts">
  import type { ChangeDesc } from '@codemirror/state';
  import MarkedEditor from './components/MarkedEditor.svelte';
  import { KIND_LABELS, sameTerm, overlaps as spansOverlap, type Finding, type Kind } from './lib/detect-types';
  import type { ReviewedDocument, TermGroup } from './lib/session';
  import type { AnalysisMessage, AnalysisRequest } from './lib/analysis-protocol';
  import ScanWorker from './workers/analysis.worker?worker&inline';
  import { remapFindings } from './lib/marks';
  import { restoreText, splitForPreview, type MaskedResult } from './lib/replace';
  import { splitFullName } from './lib/overrides';
  import { replacementKey, validateCustomToken, type ReplacementRule } from './lib/replacement-strategies';
  import { randomDateOffset, restoreShiftedDates, parseDate, calendarDayDifference, type NumericDateOrder } from './lib/dates';
  import type { MappingEntry } from './lib/replace';
  import { parsePartialDate, partialOriginalIso, nearestPartialDateOffset, restoreShiftedPartialDates, type ShiftedPartial } from './lib/partial-dates';

  const kinds: Kind[] = ['PERSON', 'FIRST_NAME', 'LAST_NAME', 'EMAIL', 'PHONE', 'IBAN', 'DATE', 'TIME', 'ADDRESS', 'STREET', 'CITY', 'POSTAL_CODE', 'URL', 'IP', 'BIC', 'ID', 'LICENSE_PLATE', 'OTHER'];

  let source = $state('');
  let manual = $state<Finding[]>([]);
  let ignoredPlaces = $state<Finding[]>([]);
  let ignoredTerms = $state<string[]>([]);
  let selectedKind = $state<Kind>('PERSON');
  let replacementRules = $state<Record<string, ReplacementRule>>({});
  let dateShiftEnabled = $state(true);
  let dateOffsetMode = $state<'random'|'manual'>('random');
  let settingsDialog: HTMLDialogElement | undefined;
  let findingsDialog: HTMLDialogElement | undefined;
  let resultVisible = $state(false);
  let cityLexiconEnabled = $state(true);
  let analysisVersion = $state(0);
  let isAnalyzing = $state(false);
  let analysisProgress = $state(0);
  let analysisStatus = $state('');
  let analysisError = $state('');
  let lastScanMs = $state<number|null>(null);
  let lexiconCounts = $state<{cities:number;cityHomonyms:number;first:number;last:number;streets:number}|null>(null);
  let scanner:Worker|null = null;
  let workerBusy = false;
  let latestJob = 0;
  let dateOffset = $state(randomDateOffset());
  let numericOrder = $state<NumericDateOrder>('auto');
  let replyNumericOrder = $state<NumericDateOrder>('auto');
  // Keep the inverse data from the last export even if the draft or offset changes.
  let exportSnapshot = $state<{mapping:MappingEntry[]; shiftedDates:string[]; partialDates:ShiftedPartial[]; offset:number}|null>(null);
  let editingReplacement = $state<string | null>(null);
  let replacementDraft = $state('');
  let replacementError = $state('');
  let selectedRange = $state({ from: 0, to: 0 });
  let quickAction = $state<{x: number; y: number} | null>(null);
  let reply = $state('');
  let notice = $state('');
  let menu = $state<{ id: string; x: number; y: number } | null>(null);
  let manualCounter = 0;
  let exclusionCounter = 0;

  let reviewed = $state<ReviewedDocument>({findings:[],active:[],groups:[]});
  let prepared = $state<MaskedResult>({text:'',mapping:[],dates:[],partialDates:[],warnings:[]});
  let findings = $derived(isAnalyzing?[]:reviewed.findings);
  let active = $derived(isAnalyzing?[]:reviewed.active);
  let groups = $derived(isAnalyzing?[]:reviewed.groups);
  let activeIds = $derived(new Set(active.map(hit=>hit.id)));
  let editorMarks = $derived(findings.map(hit => {
    const pendingReview=hit.confidence==='review' && !activeIds.has(hit.id)
      && !ignoredTerms.some(term=>sameTerm(term,hit.text))
      && !ignoredPlaces.some(place=>spansOverlap(place,hit));
    return {id:hit.id,start:hit.start,end:hit.end,
      ignored:!activeIds.has(hit.id) && !pendingReview,
      review:pendingReview,manual:hit.origin==='manual'};
  }));
  let pendingNameGroups = $derived(groups.filter(group=>group.review && group.activeCount===0
    && !ignoredTerms.some(term=>sameTerm(term,group.text))));

  function ensureScanner():void{
    if(scanner)return;
    scanner=new ScanWorker();
    scanner.onmessage=(event:MessageEvent<AnalysisMessage>)=>{
      const data=event.data;
      if(data.type==='ready'){
        lexiconCounts=data.counts;
        return;
      }
      if(data.id!==latestJob)return; // Never display outdated results.
      if(data.type==='stage'){
        analysisProgress=data.completed;
        analysisStatus=data.stage==='detect'?'Personen, Orte und Kennnummern erkennen':'Treffer prüfen und Platzhalter vorbereiten';
      }else if(data.type==='result'){
        reviewed=data.reviewed;
        prepared=data.prepared;
        lastScanMs=data.elapsedMs;
        isAnalyzing=false;
        analysisError='';
        analysisProgress=100;
        analysisStatus='Analyse abgeschlossen';
        workerBusy=false;
      }else if(data.type==='error'){
        analysisError='Die Analyse ist fehlgeschlagen: '+data.message;
        analysisStatus='Analyse fehlgeschlagen';
        isAnalyzing=false;
        workerBusy=false;
      }
    };
    scanner.onerror=()=>{
      analysisError='Die Hintergrundanalyse ist fehlgeschlagen. Bitte erneut starten.';
      analysisStatus='Analyse fehlgeschlagen';
      isAnalyzing=false;
      workerBusy=false;
      scanner?.terminate();
      scanner=null;
    };
  }

  // Debounced worker jobs: a new edit invalidates the previous result immediately.
  // Terminate a worker with a long stale job instead of queueing unbounded scans.
  $effect(()=>{
    const request:AnalysisRequest={
      type:'analyze',id:++latestJob,text:source,
      manual:$state.snapshot(manual),ignoredPlaces:$state.snapshot(ignoredPlaces),
      ignoredTerms:$state.snapshot(ignoredTerms),numericOrder,cityLexiconEnabled,
      rules:$state.snapshot(replacementRules),
      dateOptions:{dateShiftEnabled,offsetDays:dateOffset,numericOrder}
    };
    void analysisVersion;
    // Never reveal an earlier preview after source, rules or settings have changed.
    resultVisible=false;
    if(!source.trim()){
      reviewed={findings:[],active:[],groups:[]};
      prepared={text:'',mapping:[],dates:[],partialDates:[],warnings:[]};
      isAnalyzing=false;
      analysisProgress=0;
      analysisStatus='';
      analysisError='';
      lastScanMs=null;
      return;
    }
    isAnalyzing=true;
    analysisProgress=5;
    analysisError='';
    analysisStatus='Analyse wird vorbereitet';
    const timer=window.setTimeout(()=>{
      if(workerBusy){
        scanner?.terminate();
        scanner=null;
        workerBusy=false;
      }
      try{
        ensureScanner();
        workerBusy=true;
        scanner!.postMessage(request);
      }catch{
        analysisError='Hintergrundanalyse nicht verfügbar. Es wurde kein Text freigegeben.';
        analysisStatus='Analyse fehlgeschlagen';
        isAnalyzing=false;
        workerBusy=false;
      }
    },150);
    return ()=>window.clearTimeout(timer);
  });

  function openResult():void{
    if(isAnalyzing || analysisError || !source.trim())return;
    resultVisible=true;
    window.requestAnimationFrame(()=>document.getElementById('result-title')?.scrollIntoView({behavior:'smooth',block:'start'}));
  }

  function cancelAnalysis():void{
    latestJob++;
    scanner?.terminate();
    scanner=null;
    workerBusy=false;
    isAnalyzing=false;
    analysisProgress=0;
    analysisStatus='Abgebrochen';
    analysisError='Analyse abgebrochen. Zum Schutz deiner Daten ist die Ausgabe gesperrt, bis neu analysiert wurde.';
  }
  function retryAnalysis():void{
    analysisVersion++;
  }
  let hasDateOverride = $derived(Object.values(replacementRules).some(rule=>rule.mode==='shift-date'));
  let preview = $derived(splitForPreview(prepared.text));
  let inversePartial = $derived(restoreShiftedPartialDates(
    reply, exportSnapshot?.partialDates ?? prepared.partialDates,
    {numericOrder:replyNumericOrder}
  ));
  let inverseDates = $derived(restoreShiftedDates(
    inversePartial.text,exportSnapshot?.shiftedDates ?? prepared.dates.map(date=>date.shiftedIso),
    exportSnapshot?.offset ?? dateOffset,{numericOrder:replyNumericOrder}
  ));
  let restored = $derived(restoreText(inverseDates.text,exportSnapshot?.mapping ?? prepared.mapping));
  let selectedHit = $derived(findings.find(hit => hit.id === menu?.id));

  function isActive(hit: Finding): boolean {
    return active.some(item => item.id === hit.id);
  }

  function onSourceChange(next: string, changes: ChangeDesc): void {
    manual = remapFindings(manual, changes, next, 'manual');
    ignoredPlaces = remapFindings(ignoredPlaces, changes, next, 'exact');
    source = next;
    resultVisible = false;
    reply = '';
    menu = null;
    quickAction = null;
    notice = '';
  }

  function onSelect(from: number, to: number, position?: {x: number; y: number}): void {
    selectedRange = { from, to };
    quickAction = to > from && position ? {
      x: Math.max(12, Math.min(position.x, window.innerWidth - 240)),
      y: Math.max(12, Math.min(position.y + 7, window.innerHeight - 66))
    } : null;
  }

  /** A single click converts the actual current editor selection into a learned rule. */
  function setManualMark(start: number, end: number, kind: Kind): void {
    while (start < end && /\s/.test(source[start])) start++;
    while (end > start && /\s/.test(source[end - 1])) end--;
    if (start === end) {
      notice = 'Bitte zuerst einen Textbereich markieren.';
      return;
    }
    manualCounter++;
    const added: Finding = {
      id: 'manual-' + manualCounter,
      origin: 'manual',
      kind, text: source.slice(start, end), start, end
    };
    manual = [...manual.filter(hit => !spansOverlap(hit, added)), added];
    ignoredPlaces = ignoredPlaces.filter(hit => !spansOverlap(hit, added));
    ignoredTerms = ignoredTerms.filter(term => !sameTerm(term, added.text));
    menu = null;
    quickAction = null;
    selectedRange = {from: 0, to: 0};
    notice = 'Auswahl anonymisiert. Der Begriff wird im ganzen Text wiedererkannt.';
  }

  function addManual(): void {
    setManualMark(selectedRange.from, selectedRange.to, selectedKind);
  }

  function suppressOne(hit: Finding): void {
    if (!ignoredPlaces.some(entry => spansOverlap(entry, hit))) {
      exclusionCounter++;
      ignoredPlaces = [...ignoredPlaces, {...hit, id: 'ignored-' + exclusionCounter}];
    }
    menu = null;
  }

  function restoreOne(hit: Finding): void {
    if(hit.confidence==='review' && hit.origin==='automatic'){
      setManualMark(hit.start,hit.end,hit.kind);
      return;
    }
    ignoredPlaces = ignoredPlaces.filter(entry => !spansOverlap(entry, hit));
    ignoredTerms = ignoredTerms.filter(term => !sameTerm(term, hit.text));
    menu = null;
  }

  /** The list operates on distinct entities, not synthetic exclusion entries. */
  function toggleGroup(group: TermGroup, enabled: boolean): void {
    if (enabled) {
      if(group.review && group.activeCount===0){
        const suggestion=findings.find(hit=>hit.kind===group.kind
          && sameTerm(hit.text,group.text) && hit.confidence==='review');
        if(suggestion){
          setManualMark(suggestion.start,suggestion.end,suggestion.kind);
          return;
        }
      }
      ignoredTerms = ignoredTerms.filter(term => !sameTerm(term, group.text));
      const matches = findings.filter(hit => hit.kind === group.kind && sameTerm(hit.text, group.text));
      ignoredPlaces = ignoredPlaces.filter(entry => !matches.some(hit => spansOverlap(entry, hit)));
    } else if (!ignoredTerms.some(term => sameTerm(term, group.text))) {
      ignoredTerms = [...ignoredTerms, group.text];
    }
    menu = null;
  }

  function ignoreEverywhere(hit: Finding): void {
    if (!ignoredTerms.some(term => sameTerm(term, hit.text))) {
      ignoredTerms = [...ignoredTerms, hit.text];
    }
    menu = null;
  }

  function changeKind(hit: Finding, kind: Kind): void {
    setManualMark(hit.start, hit.end, kind);
  }

  function removeManualRule(hit: Finding): void {
    manual = manual.filter(anchor => anchor.id !== hit.id);
    menu = null;
    notice = 'Manuelle Erkennungsregel entfernt.';
  }

  /** Refine an automatic full-name proposal with two anchored override rules. */
  function splitName(hit: Finding): void {
    const parts = splitFullName(hit);
    if (!parts) {
      notice = 'Vor-/Nachname kann hier nicht eindeutig getrennt werden. Bitte beide Teile einzeln markieren.';
      return;
    }
    manual = [...manual.filter(item => !spansOverlap(item, hit)), ...parts];
    ignoredPlaces = ignoredPlaces.filter(item => !spansOverlap(item, hit));
    menu = null;
    notice = 'Vorname und Nachname getrennt. Beide Regeln gelten auch für weitere Vorkommen.';
  }

  function replacementFor(group: TermGroup): string {
    if (group.activeCount === 0) return 'Nicht ersetzt';
    const shifted = prepared.dates.find(entry=>group.kind==='DATE' && sameTerm(entry.original,group.text));
    if(shifted)return shifted.shifted;
    const partial = prepared.partialDates.find(entry=>group.kind==='DATE' && sameTerm(entry.original,group.text));
    if(partial)return partial.shifted;
    return prepared.mapping.find(entry =>
      entry.kind === group.kind && sameTerm(entry.original, group.text)
    )?.token ?? '—';
  }

  function dateRuleMode(group:TermGroup):'default'|'token'|'shift-date'{
    const mode=replacementRules[replacementKey(group.kind,group.text)]?.mode;
    return mode==='shift-date'||mode==='token'?mode:'default';
  }

  function setDateRuleMode(group:TermGroup,mode:'default'|'token'|'shift-date'):void{
    const key=replacementKey(group.kind,group.text);
    const next={...replacementRules};
    if(mode==='default')delete next[key];
    else if(mode==='shift-date')next[key]={mode,kind:'DATE'};
    else next[key]={mode,kind:group.kind};
    replacementRules=next;
    editingReplacement=null;
  }

  function editReplacement(group: TermGroup): void {
    const key = replacementKey(group.kind, group.text);
    editingReplacement = key;
    const rule = replacementRules[key];
    replacementDraft = rule?.mode === 'custom-token' ? rule.token : replacementFor(group);
    replacementError = '';
  }

  function saveReplacement(group: TermGroup): void {
    const key = replacementKey(group.kind, group.text);
    const token = replacementDraft.trim();
    // Editing a shifted date updates the ONE global offset. Never introduce
    // an inconsistent per-occurrence replacement that breaks chronology.
    if(group.kind==='DATE' && (prepared.dates.some(item=>sameTerm(item.original,group.text)) ||
       prepared.partialDates.some(item=>sameTerm(item.original,group.text)))){
      const fullOriginal=parseDate(group.text,{numericOrder});
      const fullTarget=parseDate(token,{numericOrder});
      const partialOriginal=parsePartialDate(group.text,{numericOrder});
      const partialTarget=parsePartialDate(token,{numericOrder});
      const origIso=fullOriginal?.iso ?? (partialOriginal && partialOriginalIso(partialOriginal));
      const targetIso=fullTarget?.iso ?? (partialTarget && partialOriginalIso(partialTarget));
      const offset=partialOriginal && partialTarget
        ?nearestPartialDateOffset(partialOriginal,partialTarget)
        :origIso && targetIso?calendarDayDifference(origIso,targetIso):null;
      if(offset===null || !Number.isSafeInteger(offset) || offset===0 || Math.abs(offset)>3650){
        replacementError='Bitte ein gültiges vollständiges Kalenderdatum wählen (maximal ±3650 Tage, nicht 0).';
        return;
      }
      dateOffset=offset;
      dateOffsetMode='manual';
      editingReplacement=null;
      replacementError='';
      notice='Tagesoffset für alle verschobenen Kalenderdaten angepasst.';
      return;
    }
    if (!token) {
      const rules = {...replacementRules};
      delete rules[key];
      replacementRules = rules;
    } else {
      const error = validateCustomToken(token);
      if (error) { replacementError = error; return; }
      if (source.includes(token)) {
        replacementError = 'Der Token kommt bereits im Originaltext vor.';
        return;
      }
      const duplicate = Object.entries(replacementRules).some(([otherKey, rule]) =>
        otherKey !== key && rule.mode === 'custom-token' && rule.token === token
      );
      if (duplicate) {
        replacementError = 'Dieser Ersatzwert wird bereits für eine andere Angabe verwendet.';
        return;
      }
      replacementRules = {...replacementRules, [key]:{mode:'custom-token',kind:group.kind,token}};
    }
    editingReplacement = null;
    replacementError = '';
    notice = 'Ersatzwert aktualisiert. Rückübersetzung bleibt möglich.';
  }

  function onHit(id: string, rect: DOMRect): void {
    quickAction = null;
    menu = {
      id,
      x: Math.max(12, Math.min(rect.left, window.innerWidth - 305)),
      y: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 285))
    };
  }

  function closeMenuOutside(event: MouseEvent): void {
    if (!(event.target instanceof Element) || !event.target.closest('.hit-popover')) {
      menu = null;
    }
  }

  function resetAll(): void {
    source = '';
    manual = [];
    ignoredPlaces = [];
    ignoredTerms = [];
    replacementRules = {};
    dateShiftEnabled = true;
    dateOffsetMode = 'random';
    cityLexiconEnabled = true;
    analysisError = '';
    dateOffset = randomDateOffset();
    numericOrder = 'auto';
    replyNumericOrder = 'auto';
    exportSnapshot = null;
    resultVisible = false;
    findingsDialog?.close();
    editingReplacement = null;
    replacementError = '';
    selectedRange = {from: 0, to: 0};
    quickAction = null;
    reply = '';
    notice = '';
    menu = null;
  }

  async function copyMasked():Promise<void>{
    if(isAnalyzing || analysisError || !source.trim() || !resultVisible)return;
    const snapshot={
      mapping:prepared.mapping.map(item=>({...item})),
      shiftedDates:prepared.dates.map(item=>item.shiftedIso),
      partialDates:prepared.partialDates.map(item=>({...item})),
      offset:dateOffset
    };
    await copy(prepared.text,'Pseudonymisierter Text');
    exportSnapshot=snapshot;
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
      notice = 'Automatisches Kopieren nicht verfügbar. Bitte Text manuell auswählen.';
    }
  }
</script>

<svelte:head>
  <title>Anonymat 2.0 · Lokale Pseudonymisierung</title>
</svelte:head>

<svelte:window onclick={closeMenuOutside} onkeydown={(event) => { if (event.key === 'Escape') menu = null; quickAction = null; }} />

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
      <button class="settings-trigger" type="button" onclick={() => settingsDialog?.showModal()} aria-label="Einstellungen öffnen">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/><circle cx="12" cy="12" r="4"/></svg>
        <span>Einstellungen</span>
      </button>
      <a class="github-link" href="https://github.com/Uli-Z/Anonymat" target="_blank" rel="noopener noreferrer">GitHub <span aria-hidden="true">↗</span></a>
    </div>
  </header>

  <main class="main-content">
    <div class="page-heading">
      <div>
        <div class="eyebrow">ARBEITSPLATZ</div>
        <h1>Vertrauliche Texte sicher vorbereiten.</h1>
        <p>Angaben werden direkt im Text hervorgehoben. Klicke auf eine Markierung, um sie zu bearbeiten.</p>
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

    {#if isAnalyzing || analysisError}
      <section class="analysis-banner" aria-label="Analysefortschritt" role="status">
        <div class="analysis-banner-content">
          <div>
            <strong>{analysisError ? 'Analyse unterbrochen' : 'Text wird geprüft…'}</strong>
            <p>{analysisError || analysisStatus}</p>
          </div>
          {#if isAnalyzing}
            <button type="button" class="secondary-button" onclick={cancelAnalysis}>Abbrechen</button>
          {:else}
            <button type="button" class="secondary-button" onclick={retryAnalysis}>Erneut analysieren</button>
          {/if}
        </div>
        {#if isAnalyzing}
          <progress value={analysisProgress} max="100" aria-label="Analysefortschritt"></progress>
        {/if}
      </section>
    {/if}

    <div class="editing-workspace">
      <section class="panel editor-panel" aria-labelledby="source-title">
        <div class="panel-heading">
          <div>
            <h3 id="source-title">Originaltext</h3>
            <p>Farbige Treffer anklicken oder Text auswählen und sofort anonymisieren</p>
          </div>
          <span class="quiet-count">{source.length.toLocaleString('de-DE')} Zeichen</span>
        </div>
        <MarkedEditor value={source} marks={editorMarks} onChange={onSourceChange} onSelect={onSelect} onHit={onHit} />
        <div class="selection-toolbar">
          <div class="selection-help">
            {#if selectedRange.to > selectedRange.from}
              {selectedRange.to - selectedRange.from} Zeichen ausgewählt
            {:else}
              Text auswählen, dann mit einem Klick anonymisieren:
            {/if}
          </div>
          <div class="selection-actions">
            <select bind:value={selectedKind} aria-label="Kategorie für manuelle Markierung">
              {#each kinds as kind}
                <option value={kind}>{KIND_LABELS[kind]}</option>
              {/each}
            </select>
            <button type="button" class="small-primary" onpointerdown={(event) => event.preventDefault()} onclick={addManual} disabled={selectedRange.to === selectedRange.from}>+ Auswahl anonymisieren</button>
          </div>
        </div>
        <div class="mark-legend" aria-label="Farblegende">
          <span><i class="legend-auto"></i> Automatisch</span>
          <span><i class="legend-review"></i> Prüfvorschlag</span>
          <span><i class="legend-manual"></i> Manuell</span>
          <span><i class="legend-ignored"></i> Ignoriert</span>
        </div>
        <div class="editor-actions">
          <button type="button" class="secondary-button" onclick={() => { quickAction=null; menu=null; findingsDialog?.showModal(); }}>
            Ersetzungen anzeigen <span class="count-inline">{groups.length}</span>{#if pendingNameGroups.length}<span class="count-inline">· {pendingNameGroups.length} prüfen</span>{/if}
          </button>
          <button type="button" class="primary-button" onclick={openResult} disabled={!source.trim() || isAnalyzing || !!analysisError}>
            Ergebnis prüfen <span aria-hidden="true">↓</span>
          </button>
        </div>
      </section>
    </div>

    <div class="step-heading second-step">
      <div class="step-number">2</div>
      <div>
        <h2>Ergebnis prüfen</h2>
        <p>Die anonymisierte Fassung wird erst auf Wunsch angezeigt. Kontrolliere alle Angaben vor der Weitergabe.</p>
      </div>
    </div>

    <section class="panel output-panel" aria-labelledby="result-title">
      <div class="panel-heading">
        <div>
          <h3 id="result-title">Pseudonymisierter Text</h3>
          <p>Nur diesen überprüften Text an externe KI-Dienste weitergeben</p>
        </div>
        <button class="primary-button" type="button" onclick={copyMasked} disabled={!resultVisible || !source.trim() || isAnalyzing || !!analysisError}>
          <span aria-hidden="true">⧉</span> Text kopieren
        </button>
      </div>
      <div class="preview" aria-live="polite">
        {#if !resultVisible}
          <div class="preview-gate">
            <p>Der Ergebnistext bleibt während der Bearbeitung ausgeblendet. Sobald die Analyse abgeschlossen ist, kannst du ihn hier kontrollieren.</p>
            <button type="button" class="secondary-button" onclick={() => resultVisible=true} disabled={!source.trim() || isAnalyzing || !!analysisError}>Anonymisierten Text anzeigen</button>
          </div>
        {:else if isAnalyzing}
          <span class="preview-empty">Analyse läuft – vor der vollständigen Prüfung wird kein Text freigegeben.</span>
        {:else if analysisError}
          <span class="preview-empty">Analyse nicht abgeschlossen. Bitte erneut analysieren.</span>
        {:else if source.trim()}
          {#each preview as part}
            {#if part.token}<span class="placeholder-token">{part.value}</span>{:else}{part.value}{/if}
          {/each}
        {:else}
          <span class="preview-empty">Hier erscheint die Vorschau mit den ersetzten Angaben.</span>
        {/if}
      </div>
      {#if resultVisible && pendingNameGroups.length}
        <div class="inline-warning">{pendingNameGroups.length} mögliche Namen sind noch nicht ersetzt. Die blau markierten Prüfvorschläge im Originaltext können per Klick oder über „Ersetzungen anzeigen“ bestätigt oder ignoriert werden.</div>
      {/if}
      {#if resultVisible && prepared.warnings.length}
        <div class="inline-warning">{prepared.warnings.join(' ')}</div>
      {/if}
      {#if resultVisible && source.trim() && !isAnalyzing && !analysisError && prepared.mapping.length === 0 && prepared.dates.length === 0 && prepared.partialDates.length === 0}
        <div class="inline-warning">Es sind keine Angaben markiert. Bitte prüfe den Originaltext, bevor du ihn weitergibst.</div>
      {/if}
    </section>

    <div class="step-heading third-step">
      <div class="step-number">3</div>
      <div>
        <h2>KI-Ergebnis zurückübersetzen</h2>
        <p>Füge den bearbeiteten oder übersetzten Text ein. Platzhalter und bekannte verschobene Kalenderdaten werden lokal wiederhergestellt.</p>
      </div>
    </div>

    <div class="restore-grid">
      <section class="panel" aria-labelledby="reply-title">
        <div class="panel-heading">
          <div><h3 id="reply-title">Antwort der KI</h3><p>Text mit Platzhaltern hier einfügen</p></div>
        </div>
        <textarea class="reply-editor" bind:value={reply} spellcheck="false"
          placeholder="Hier die Antwort von ChatGPT oder einem anderen Tool mit [PERSON_001] usw. einfügen ..."
          aria-label="KI-Antwort mit Platzhaltern"></textarea>
      </section>
      <section class="panel" aria-labelledby="restored-title">
        <div class="panel-heading">
          <div><h3 id="restored-title">Wiederhergestellter Text</h3><p>Originalangaben lokal eingesetzt</p></div>
          <button class="secondary-button" type="button" disabled={!reply.trim()} onclick={() => copy(restored.text, 'Wiederhergestellter Text')}>⧉ Kopieren</button>
        </div>
        <div class="restore-preview">{#if reply.trim()}{restored.text}{:else}<span class="preview-empty">Die Rückübersetzung wird hier angezeigt.</span>{/if}</div>
        {#if reply.trim() && (inverseDates.warnings.length || inversePartial.warnings.length)}
          <div class="inline-warning">{[...inversePartial.warnings,...inverseDates.warnings].join(' ')}</div>
        {/if}
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
      <span>Automatische Erkennungen sind Vorschläge und müssen geprüft werden. Die Verarbeitung erfolgt lokal; Texte werden nicht gespeichert oder versendet.</span>
    </div>
    {#if notice}<div class="toast" role="status">{notice}</div>{/if}
  </main>

  <footer class="site-footer"><span>Anonymat 2.0 Alpha 6 · Lokales Werkzeug · Open Source</span><span>Alpha – nicht für ungeprüfte vertrauliche Dokumente verwenden</span></footer>

      <dialog class="findings-dialog" bind:this={findingsDialog} aria-labelledby="findings-title">
        <div class="panel-heading">
          <div>
            <h3 id="findings-title">Erkannte Angaben</h3>
            <p>Auch direkt über den Text bearbeitbar</p>
          </div>
          <div class="findings-dialog-actions"><span class="count-badge">{findings.length}</span><form method="dialog"><button class="settings-close" type="submit" aria-label="Ersetzungen schließen">×</button></form></div>
        </div>
        <div class="findings-body">
          {#if groups.length === 0}
            <div class="empty-state">
              <div class="empty-symbol" aria-hidden="true">⌕</div>
              <strong>Noch keine Treffer</strong>
              <p>Text einfügen oder links einen Bereich auswählen und anonymisieren.</p>
            </div>
          {:else}
            <div class="list-caption">{active.length} von {findings.length} Textstellen aktiv · {groups.length} unterschiedliche Begriffe</div>
            <div class="findings-list">
              {#each groups as group (group.key)}
                <div class="finding-row" class:muted-finding={group.activeCount === 0 && !pendingNameGroups.some(entry=>entry.key===group.key)}>
                  <input type="checkbox" checked={group.activeCount > 0}
                    aria-label={group.text + ' im ganzen Text anonymisieren'}
                    onchange={event => toggleGroup(group, event.currentTarget.checked)} />
                  <span class="finding-details">
                    <span class="finding-value">{group.text} {#if group.count > 1}<span class="count-inline">× {group.count}</span>{/if}</span>
                    <span class="finding-meta">{KIND_LABELS[group.kind]} · {group.manual ? 'Manuell gelernt' : 'Automatisch erkannt'}
                      {#if pendingNameGroups.some(entry=>entry.key===group.key)} · Prüfvorschlag (noch nicht ersetzt){:else if group.activeCount === 0} · Ignoriert{:else if group.activeCount < group.count} · {group.activeCount}/{group.count} aktiv{/if}
                    </span>
                    {#if group.activeCount > 0}
                      {#if editingReplacement === replacementKey(group.kind,group.text)}
                        <form class="replacement-editor" onsubmit={(event) => { event.preventDefault(); saveReplacement(group); }}>
                          <input type="text" aria-label={'Ersatzwert für '+group.text} bind:value={replacementDraft} spellcheck="false" />
                          <button type="submit">Speichern</button>
                          <button type="button" onclick={() => editingReplacement = null}>Abbrechen</button>
                          {#if group.kind==='DATE' && prepared.dates.some(item=>sameTerm(item.original,group.text))}
                            <div>Ändert den gemeinsamen Tagesoffset für alle verschobenen Daten.</div>
                          {/if}
                          {#if replacementError}<div class="replacement-error">{replacementError}</div>{/if}
                        </form>
                      {:else}
                        <div class="replacement-inline">
                          <span class="replacement-arrow" aria-hidden="true">→</span>
                          <code>{replacementFor(group)}</code>
                          <button type="button" aria-label={'Ersatzwert für '+group.text+' bearbeiten'} onclick={() => editReplacement(group)}>Ändern</button>
                        </div>
                      {/if}
                    {/if}
                    {#if group.kind==='DATE' && group.activeCount>0}
                      <label style="display:flex;gap:6px;align-items:center;margin-top:8px">
                        Ersetzen als
                        <select aria-label={'Ersetzungsmethode für '+group.text}
                          value={dateRuleMode(group)}
                          onchange={event => setDateRuleMode(group,event.currentTarget.value as 'default'|'token'|'shift-date')}>
                          <option value="default">Standard ({dateShiftEnabled?'Verschiebung':'Token'})</option>
                          <option value="shift-date">Datum verschieben</option>
                          <option value="token">Platzhalter</option>
                        </select>
                      </label>
                    {/if}
                  </span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </dialog>

  <dialog class="settings-dialog" bind:this={settingsDialog} aria-labelledby="settings-title">
    <div class="settings-header">
      <div>
        <h2 id="settings-title">Einstellungen</h2>
        <p>Erkennung, Datumsangaben und Rückübersetzung</p>
      </div>
      <form method="dialog">
        <button type="submit" class="settings-close" aria-label="Einstellungen schließen">×</button>
      </form>
    </div>
    <div class="settings-body">
      <section class="settings-section" aria-labelledby="settings-dates">
        <h3 id="settings-dates">Datumsangaben</h3>
        <label class="settings-toggle">
          <input type="checkbox" bind:checked={dateShiftEnabled}/>
          <span><strong>Kalenderdaten verschieben</strong><small>Standardmäßig aktiv. Vollständige Datumsangaben erhalten denselben Tagesversatz, sodass Zeitabstände erhalten bleiben.</small></span>
        </label>
        {#if dateShiftEnabled || hasDateOverride}
          <div class="settings-field">
            <label for="date-shift-mode">Verschiebung</label>
            <select id="date-shift-mode" value={dateOffsetMode}
              onchange={event => {
                dateOffsetMode = event.currentTarget.value as 'random'|'manual';
                if (dateOffsetMode === 'random') dateOffset = randomDateOffset();
              }}>
              <option value="random">Zufällig (empfohlen)</option>
              <option value="manual">Manuell festlegen</option>
            </select>
            {#if dateOffsetMode === 'manual'}
              <div class="settings-offset-row">
                <label for="date-offset">Tage</label>
                <input id="date-offset" type="number" min="-3650" max="3650" step="1" bind:value={dateOffset}/>
              </div>
              {#if !Number.isSafeInteger(dateOffset) || dateOffset === 0 || Math.abs(dateOffset) > 3650}
                <p class="settings-error">Eine ganze Zahl von −3650 bis +3650, ausgenommen 0, eingeben.</p>
              {/if}
            {:else}
              <div class="settings-random-row">
                <p>Der genaue Wert bleibt verborgen. Für einen neuen Text wird er automatisch neu gewählt. Datumsangaben ohne Jahr erhalten intern ein festes Kalenderjahr.</p>
                <button type="button" class="secondary-button" onclick={() => dateOffset = randomDateOffset()}>Neuen Zufallswert wählen</button>
              </div>
            {/if}
          </div>
        {/if}
        <div class="settings-field">
          <label for="source-date-order">Mehrdeutige Zahlenformate im Original</label>
          <select id="source-date-order" bind:value={numericOrder}>
            <option value="auto">Nicht verändern und warnen</option>
            <option value="DMY">Tag/Monat/Jahr</option>
            <option value="MDY">Monat/Tag/Jahr (US)</option>
          </select>
        </div>
        <p class="settings-note">Verschobene Daten sind pseudonymisiert, nicht vollständig anonymisiert. Bitte auf indirekte Identifizierbarkeit prüfen.</p>
      </section>

      <section class="settings-section" aria-labelledby="settings-detection">
        <h3 id="settings-detection">Automatische Erkennung</h3>
        <label class="settings-toggle">
          <input type="checkbox" bind:checked={cityLexiconEnabled}/>
          <span><strong>Europäische Ortsnamen erkennen</strong><small>Lokale Wörterbücher und Kontextregeln helfen bei der Ortserkennung.</small></span>
        </label>
        <details class="settings-details">
          <summary>Lexika und Quellen</summary>
          <p>{#if lexiconCounts}
            {lexiconCounts.first.toLocaleString('de-DE')} Vornamen ·
            {lexiconCounts.last.toLocaleString('de-DE')} Nachnamen ·
            {lexiconCounts.streets.toLocaleString('de-DE')} Straßen ·
            {lexiconCounts.cities.toLocaleString('de-DE')} Orte (davon {lexiconCounts.cityHomonyms.toLocaleString('de-DE')} mehrdeutige Namen).
          {:else}
            Die Größenangaben der Lexika erscheinen nach der ersten Analyse.
          {/if}</p>
          <p>GeoNames (CC BY 4.0), Universal Dependencies German-GSD (CC BY-SA 4.0), Onomaverse (CC BY 4.0), OpenStreetMap / OpenPLZ (ODbL 1.0). Alle Daten sind offline eingebettet.</p>
          {#if lastScanMs !== null}<p>Letzter vollständiger Scan: {lastScanMs.toFixed(0)} ms.</p>{/if}
        </details>
      </section>

      <section class="settings-section" aria-labelledby="settings-reply">
        <h3 id="settings-reply">Rückübersetzung</h3>
        <div class="settings-field">
          <label for="reply-date-order">Mehrdeutige Zahlenformate in KI-Antworten</label>
          <select id="reply-date-order" bind:value={replyNumericOrder}>
            <option value="auto">Nicht verändern und warnen</option>
            <option value="DMY">Tag/Monat/Jahr</option>
            <option value="MDY">Monat/Tag/Jahr (US)</option>
          </select>
          <p>Bei übersetzten Datumsangaben kann eine andere Tag-Monat-Reihenfolge nötig sein.</p>
        </div>
      </section>
    </div>
    <div class="settings-footer">
      <span>Änderungen werden direkt lokal übernommen.</span>
      <form method="dialog"><button type="submit" class="primary-button">Schließen</button></form>
    </div>
  </dialog>

  {#if quickAction && selectedRange.to > selectedRange.from && !menu}
    <div class="selection-popover" style={'left:' + quickAction.x + 'px;top:' + quickAction.y + 'px'}
      onpointerdown={(event) => event.preventDefault()} role="group" aria-label="Textauswahl anonymisieren">
      <button type="button" onclick={addManual}>+ Auswahl anonymisieren</button>
    </div>
  {/if}

  {#if menu && selectedHit}
    <div class="hit-popover" role="dialog" aria-label="Markierung bearbeiten" style={'left:' + menu.x + 'px;top:' + menu.y + 'px'}>
      <div class="hit-popover-heading">
        <span class="hit-popover-title">{selectedHit.text}</span>
        <button type="button" class="hit-close" aria-label="Schließen" onclick={() => menu = null}>×</button>
      </div>
      <label class="hit-type-label" for="hit-kind">Platzhalter-Typ</label>
      <select id="hit-kind" class="hit-type-select" value={selectedHit.kind}
        onchange={event => changeKind(selectedHit!, event.currentTarget.value as Kind)}>
        {#each kinds as kind}
          <option value={kind}>{KIND_LABELS[kind]}</option>
        {/each}
      </select>
      <div class="hit-actions">
        {#if !isActive(selectedHit)}
          <button type="button" onclick={() => restoreOne(selectedHit!)}>{selectedHit.confidence==='review'?'✓ Als Namen bestätigen':'✓ Wieder anonymisieren'}</button>
        {:else}
          <button type="button" onclick={() => suppressOne(selectedHit!)}>✕ Nur diese Stelle ignorieren</button>
          <button type="button" onclick={() => ignoreEverywhere(selectedHit!)}>⊘ Begriff im ganzen Text ignorieren</button>
        {/if}
        {#if splitFullName(selectedHit)}
          <button type="button" onclick={() => splitName(selectedHit!)}>↳ In Vorname und Nachname aufteilen</button>
        {/if}
        {#if manual.some(anchor => anchor.id === selectedHit?.id)}
          <button type="button" onclick={() => removeManualRule(selectedHit!)}>− Manuelle Erkennungsregel entfernen</button>
        {/if}
      </div>
    </div>
  {/if}
</div>
