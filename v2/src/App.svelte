<script lang="ts">
  import type { ChangeDesc } from '@codemirror/state';
  import MarkedEditor from './components/MarkedEditor.svelte';
  import { KIND_LABELS, sameTerm, overlaps as spansOverlap, type Finding, type Kind } from './lib/detect';
  import type { ReviewedDocument, TermGroup } from './lib/session';
  import type { AnalysisMessage, AnalysisRequest } from './lib/analysis-protocol';
  import ScanWorker from './workers/analysis.worker?worker&inline';
  import { remapFindings } from './lib/marks';
  import { restoreText, splitForPreview, type MaskedResult } from './lib/replace';
  import { splitFullName } from './lib/overrides';
  import { replacementKey, validateCustomToken, type ReplacementRule } from './lib/replacement-strategies';
  import { randomDateOffset, restoreShiftedDates, parseDate, calendarDayDifference, type NumericDateOrder } from './lib/dates';
  import type { MappingEntry } from './lib/replace';
  import { parsePartialDate, partialOriginalIso, restoreShiftedPartialDates, type ShiftedPartial } from './lib/partial-dates';

  const kinds: Kind[] = ['PERSON', 'FIRST_NAME', 'LAST_NAME', 'EMAIL', 'PHONE', 'IBAN', 'DATE', 'TIME', 'ADDRESS', 'STREET', 'CITY', 'POSTAL_CODE', 'URL', 'IP', 'BIC', 'ID', 'LICENSE_PLATE', 'OTHER'];

  let source = $state('');
  let manual = $state<Finding[]>([]);
  let ignoredPlaces = $state<Finding[]>([]);
  let ignoredTerms = $state<string[]>([]);
  let selectedKind = $state<Kind>('PERSON');
  let replacementRules = $state<Record<string, ReplacementRule>>({});
  let dateShiftEnabled = $state(false);
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
  let partialReferenceYear = $state<number | null>(null);
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
  let editorMarks = $derived(findings.map(hit => ({
    id:hit.id,start:hit.start,end:hit.end,
    ignored:!activeIds.has(hit.id),manual:hit.origin==='manual'
  })));

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
      dateOptions:{dateShiftEnabled,offsetDays:dateOffset,numericOrder,partialReferenceYear}
    };
    void analysisVersion;
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
    ignoredPlaces = ignoredPlaces.filter(entry => !spansOverlap(entry, hit));
    ignoredTerms = ignoredTerms.filter(term => !sameTerm(term, hit.text));
    menu = null;
  }

  /** The list operates on distinct entities, not synthetic exclusion entries. */
  function toggleGroup(group: TermGroup, enabled: boolean): void {
    if (enabled) {
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
      const origIso=fullOriginal?.iso ?? (partialOriginal && partialOriginalIso(partialOriginal,partialReferenceYear));
      const targetIso=fullTarget?.iso ?? (partialTarget && partialOriginalIso(partialTarget,partialReferenceYear));
      const offset=origIso && targetIso?calendarDayDifference(origIso,targetIso):null;
      if(offset===null || !Number.isSafeInteger(offset) || offset===0 || Math.abs(offset)>3650){
        replacementError='Bitte ein gültiges vollständiges Kalenderdatum wählen (maximal ±3650 Tage, nicht 0).';
        return;
      }
      dateOffset=offset;
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
    dateShiftEnabled = false;
    cityLexiconEnabled = true;
    analysisError = '';
    dateOffset = randomDateOffset();
    numericOrder = 'auto';
    replyNumericOrder = 'auto';
    partialReferenceYear = null;
    exportSnapshot = null;
    editingReplacement = null;
    replacementError = '';
    selectedRange = {from: 0, to: 0};
    quickAction = null;
    reply = '';
    notice = '';
    menu = null;
  }

  async function copyMasked():Promise<void>{
    if(isAnalyzing || analysisError || !source.trim())return;
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

    <section class="panel" aria-labelledby="date-options-title" style="padding: 18px 22px; margin-bottom: 18px;">
      <h3 id="date-options-title" style="margin:0 0 10px">Datumsangaben</h3>
      <label style="display:flex;align-items:center;gap:10px">
        <input type="checkbox" bind:checked={dateShiftEnabled}/>
        Erkannte Kalenderdaten statt Platzhaltern gemeinsam verschieben
      </label>
      <p style="margin:8px 0 10px">Vollständige Kalenderdaten werden mit einem gemeinsamen Tagesoffset verschoben. Unvollständige Angaben werden erkannt und standardmäßig als Token geschützt.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0">
        <label for="partial-reference-year">Bezugsjahr für Daten ohne Jahr (optional)</label>
        <input id="partial-reference-year" type="number" min="1000" max="9999" step="1"
          value={partialReferenceYear ?? ''}
          oninput={event => {
            const raw=event.currentTarget.value.trim();
            partialReferenceYear=raw?Number(raw):null;
          }}
          placeholder="z. B. 2026" style="max-width:112px"/>
        <span>Nur mit festgelegtem Bezugsjahr lassen sich z. B. „10. März“ oder „10.03.“ verschieben.</span>
      </div>
      <p style="margin:0 0 10px">„März 2026“, „03/2026“ und „im März“ bleiben Platzhalter: Ohne Kalendertag ist eine exakte Tagesverschiebung nicht definierbar.</p>
      {#if dateShiftEnabled || hasDateOverride}
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
          <label for="date-offset">Verschiebung in Tagen</label>
          <input id="date-offset" type="number" min="-3650" max="3650" step="1" bind:value={dateOffset} style="max-width:100px"/>
          <button type="button" class="secondary-button" onclick={() => dateOffset=randomDateOffset()}>Neu zufällig wählen</button>
          {#if !Number.isSafeInteger(dateOffset) || dateOffset===0 || Math.abs(dateOffset)>3650}
            <span class="inline-warning">Bitte einen ganzzahligen Wert von −3650 bis +3650 außer 0 wählen.</span>
          {/if}
        </div>
      {/if}
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
        <label for="source-date-order">Mehrdeutige Zahlenformate im Original</label>
        <select id="source-date-order" bind:value={numericOrder}>
          <option value="auto">Auslassen und warnen</option>
          <option value="DMY">Tag/Monat/Jahr</option>
          <option value="MDY">Monat/Tag/Jahr (US)</option>
        </select>
      </div>
      <p style="margin:10px 0 0">Datumsverschiebung ist Pseudonymisierung, keine vollständige Anonymisierung. Ungültige und nicht eindeutige Daten müssen geprüft werden.</p>
    </section>

    <section class="panel" aria-labelledby="lexicon-title" style="padding:18px 22px;margin-bottom:18px">
      <h3 id="lexicon-title" style="margin:0 0 10px">Automatische Ortserkennung</h3>
      <label style="display:flex;gap:10px;align-items:center">
        <input type="checkbox" bind:checked={cityLexiconEnabled}/>
        Europäische Städte und Orte mit lokalem Lexikon abgleichen
      </label>
      <p style="margin:8px 0 0">{lexiconCounts?lexiconCounts.cities.toLocaleString('de-DE'):'…'} bekannte Ortsnamen offline verfügbar. Bei {lexiconCounts?lexiconCounts.cityHomonyms.toLocaleString('de-DE'):'…'} Ortsnamen ist auch eine gewöhnliche deutsche Wortverwendung aus einem Wortartenkorpus belegt; für diese ist Ortskontext erforderlich. Erkennungen lassen sich einzeln oder global ignorieren.</p>
      <p style="margin:6px 0 0">Datengrundlage: GeoNames (CC BY 4.0), Universal Dependencies German-GSD (CC BY-SA 4.0), Onomaverse (CC BY 4.0), OpenStreetMap / OpenPLZ (ODbL 1.0). Alle Listen sind im HTML eingebettet; keine Online-Abfrage beim Bearbeiten.</p>
    </section>

    <section class="panel" style="padding:15px 22px;margin-bottom:18px" aria-label="Analysefortschritt">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <strong>{isAnalyzing?'Analysiere Text…':analysisError?'Analyse unterbrochen':'Analyse'}</strong>
          <p style="margin:3px 0 0">{isAnalyzing?analysisStatus:analysisError||((lastScanMs===null)?'Die Analyse startet nach Texteingabe.':'Letzter vollständiger Scan: '+lastScanMs.toFixed(0)+' ms')}</p>
        </div>
        {#if isAnalyzing}
          <button type="button" class="secondary-button" onclick={cancelAnalysis}>Abbrechen</button>
        {:else if analysisError}
          <button type="button" class="secondary-button" onclick={retryAnalysis}>Erneut analysieren</button>
        {/if}
      </div>
      <progress value={analysisProgress} max="100" aria-label="Analysefortschritt" style={'width:100%;margin-top:10px;height:12px;visibility:'+(isAnalyzing?'visible':'hidden')}></progress>
      <p style="margin:4px 0 0;font-size:12px;min-height:16px;visibility:{isAnalyzing?'visible':'hidden'}">Der Balken zeigt Verarbeitungsschritte, keine genaue Restzeit. Die Seite bleibt während der Suche bedienbar.</p>
      <p style="margin:5px 0 0;font-size:12px">
        Lexika: {lexiconCounts?lexiconCounts.first.toLocaleString('de-DE'):'…'} Vornamen ·
        {lexiconCounts?lexiconCounts.last.toLocaleString('de-DE'):'…'} Nachnamen ·
        {lexiconCounts?lexiconCounts.streets.toLocaleString('de-DE'):'…'} Straßen ·
        {lexiconCounts?lexiconCounts.cities.toLocaleString('de-DE'):'…'} Ortsnamen
      </p>
    </section>

    <div class="workspace-grid">
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
          <span><i class="legend-manual"></i> Manuell</span>
          <span><i class="legend-ignored"></i> Ignoriert</span>
        </div>
      </section>

      <section class="panel findings-panel" aria-labelledby="findings-title">
        <div class="panel-heading">
          <div>
            <h3 id="findings-title">Erkannte Angaben</h3>
            <p>Auch direkt über den Text bearbeitbar</p>
          </div>
          <span class="count-badge">{findings.length}</span>
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
                <div class="finding-row" class:muted-finding={group.activeCount === 0}>
                  <input type="checkbox" checked={group.activeCount > 0}
                    aria-label={group.text + ' im ganzen Text anonymisieren'}
                    onchange={event => toggleGroup(group, event.currentTarget.checked)} />
                  <span class="finding-details">
                    <span class="finding-value">{group.text} {#if group.count > 1}<span class="count-inline">× {group.count}</span>{/if}</span>
                    <span class="finding-meta">{KIND_LABELS[group.kind]} · {group.manual ? 'Manuell gelernt' : 'Automatisch erkannt'}
                      {#if group.activeCount === 0} · Ignoriert{:else if group.activeCount < group.count} · {group.activeCount}/{group.count} aktiv{/if}
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
      </section>
    </div>

    <section class="panel output-panel" aria-labelledby="result-title">
      <div class="panel-heading">
        <div>
          <h3 id="result-title">Pseudonymisierter Text</h3>
          <p>Nur diesen überprüften Text an externe KI-Dienste weitergeben</p>
        </div>
        <button class="primary-button" type="button" onclick={copyMasked} disabled={!source.trim() || isAnalyzing || !!analysisError}>
          <span aria-hidden="true">⧉</span> Text kopieren
        </button>
      </div>
      <div class="preview" aria-live="polite">
        {#if isAnalyzing}
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
      {#if prepared.warnings.length}
        <div class="inline-warning">{prepared.warnings.join(' ')}</div>
      {/if}
      {#if source.trim() && !isAnalyzing && !analysisError && prepared.mapping.length === 0}
        <div class="inline-warning">Es sind keine Angaben markiert. Bitte prüfe den Originaltext, bevor du ihn weitergibst.</div>
      {/if}
    </section>

    <div class="step-heading second-step">
      <div class="step-number">2</div>
      <div>
        <h2>KI-Ergebnis zurückübersetzen</h2>
        <p>Füge den bearbeiteten oder übersetzten Text ein. Platzhalter und bekannte verschobene Kalenderdaten werden lokal wiederhergestellt.</p>
      </div>
    </div>

    {#if (exportSnapshot?.shiftedDates.length ?? prepared.dates.length)>0 || (exportSnapshot?.partialDates.length ?? prepared.partialDates.length)>0}
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
        <label for="reply-date-order">Zahlenformate im übersetzten KI-Text</label>
        <select id="reply-date-order" bind:value={replyNumericOrder}>
          <option value="auto">Mehrdeutige Daten nicht verändern</option>
          <option value="DMY">Tag/Monat/Jahr</option>
          <option value="MDY">Monat/Tag/Jahr (US)</option>
        </select>
        {#if exportSnapshot}<span>Wiederherstellung verwendet den zuletzt zum Kopieren vorbereiteten Stand.</span>{/if}
      </div>
    {/if}
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
      <span>Prototyp: erweiterte Muster, Namen mit Flexionsformen, Adressen, Kennnummern und Ortslexikon. Fehlalarme und übersehene Angaben bleiben möglich – bitte den gesamten Text prüfen. Texte werden nicht gespeichert oder versendet. Datumsverschiebung ist optional.</span>
    </div>
    {#if notice}<div class="toast" role="status">{notice}</div>{/if}
  </main>

  <footer class="site-footer"><span>Anonymat 2.0 Alpha 6 · Lokales Werkzeug · Open Source</span><span>Alpha – nicht für ungeprüfte vertrauliche Dokumente verwenden</span></footer>

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
          <button type="button" onclick={() => restoreOne(selectedHit!)}>✓ Wieder anonymisieren</button>
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
