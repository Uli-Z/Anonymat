<script lang="ts">
  import type { ChangeDesc } from '@codemirror/state';
  import { onMount } from 'svelte';
  import MarkedEditor from './components/MarkedEditor.svelte';
  import { KIND_LABELS, sameTerm, overlaps as spansOverlap, type Finding, type Kind } from './lib/detect-types';
  import type { ReviewedDocument, TermGroup } from './lib/session';
  import type { AnalysisMessage, AnalysisRequest } from './lib/analysis-protocol';
  import ScanWorker from './workers/analysis.worker?worker&inline';
  import { remapFindings } from './lib/marks';
  import { restoreText, splitForPreview, type MaskedResult } from './lib/replace';
  import { splitFullName } from './lib/overrides';
  import { normalizedKey, makeRule, loadLearnedRules, saveLearnedRules, deleteLearnedRule, clearLearnedRules, type LearnedRule } from './lib/learned-rules';
  import { replacementKey, validateCustomToken, type ReplacementRule } from './lib/replacement-strategies';
  import { randomDateOffset, restoreShiftedDates, parseDate, calendarDayDifference, type NumericDateOrder } from './lib/dates';
  import type { MappingEntry } from './lib/replace';
  import { parsePartialDate, partialOriginalIso, nearestPartialDateOffset, restoreShiftedPartialDates, type ShiftedPartial } from './lib/partial-dates';

  const kinds: Kind[] = ['PERSON', 'FIRST_NAME', 'LAST_NAME', 'EMAIL', 'PHONE', 'IBAN', 'DATE', 'TIME', 'ADDRESS', 'STREET', 'CITY', 'POSTAL_CODE', 'URL', 'IP', 'BIC', 'ID', 'LICENSE_PLATE', 'OTHER'];
  const quickKinds: Kind[] = ['PERSON', 'FIRST_NAME', 'LAST_NAME', 'DATE', 'CITY'];
  const extraKinds = kinds.filter(kind => kind !== 'OTHER' && !quickKinds.includes(kind));

  let source = $state('');
  let manual = $state<Finding[]>([]);
  let ignoredPlaces = $state<Finding[]>([]);
  let ignoredTerms = $state<string[]>([]);
  let replacementRules = $state<Record<string, ReplacementRule>>({});
  let dateShiftEnabled = $state(true);
  let dateOffsetMode = $state<'random'|'manual'>('random');
  let settingsDialog: HTMLDialogElement | undefined;
  let faqDialog: HTMLDialogElement | undefined;
  let consentDialog: HTMLDialogElement | undefined;
  let reviewDialog: HTMLDialogElement | undefined;
  let consentState = $state<'unknown'|'on'|'off'>('unknown');
  let learnedRules = $state<LearnedRule[]>([]);
  let pendingLearning = $state<LearnedRule[]>([]);
  let rememberAutomatically = $state(false);
  let learningBusy = $state(false);
  let reviewPromptHandled = false;
  let reviewPromptTimer: number | undefined;
  let markedEditor: MarkedEditor | undefined;
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
  let pendingGroups = $derived(groups.filter(group=>group.review && group.activeCount===0
    && !ignoredTerms.some(term=>sameTerm(term,group.text))));
  let priorSuggestions = $derived(pendingGroups.filter(group=>group.learned).length);
  let patternSuggestions = $derived(pendingGroups.length-priorSuggestions);

  function mergeRemembered(existing:readonly LearnedRule[], incoming:readonly LearnedRule[]):LearnedRule[]{
    const map=new Map(existing.map(rule=>[rule.key,rule]));
    for(const rule of incoming)map.set(rule.key,rule);
    return [...map.values()].sort((a,b)=>a.term.localeCompare(b.term,'de'));
  }
  function memoryFailure():void{
    notice='Der lokale Regelspeicher ist nicht verfügbar. Die Markierungen gelten weiterhin für diesen Text.';
  }
  async function enableMemory(enabled:boolean):Promise<void>{
    if(learningBusy)return;
    if(!enabled){
      pendingLearning=[];
      consentState='off';
      try{localStorage.setItem('anonymat-learning-consent-v1','off');}catch{memoryFailure();}
      consentDialog?.close();
      return;
    }
    learningBusy=true;
    const queued=[...pendingLearning];
    try{
      const saved=await loadLearnedRules();
      if(queued.length)await saveLearnedRules(queued);
      learnedRules=mergeRemembered(saved,queued);
      pendingLearning=[];
      consentState='on';
      try{localStorage.setItem('anonymat-learning-consent-v1','on');}catch{memoryFailure();}
      consentDialog?.close();
    }catch{memoryFailure();}
    finally{learningBusy=false;}
  }
  onMount(()=>{
    let cancelled=false;
    let pref:'unknown'|'on'|'off'='unknown';
    try{
      const value=localStorage.getItem('anonymat-learning-consent-v1');
      if(value==='on'||value==='off')pref=value;
    }catch{ /* Private browsing can restrict site storage. */ }
    consentState=pref;
    if(pref==='on'){
      void loadLearnedRules().then(rules=>{
        if(!cancelled)learnedRules=rules;
      }).catch(()=>{if(!cancelled){consentState='off';memoryFailure();}});
    }
    return ()=>{
      cancelled=true;
      window.clearTimeout(reviewPromptTimer);
    };
  });
  function recordLearning(term:string,kind:Kind,auto=false):void{
    const base=makeRule(term,kind,auto);
    if(!base)return;
    const previous=[...learnedRules,...pendingLearning].find(rule=>rule.key===base.key);
    const rule={...base,autoApply:auto || (previous?.kind===kind && previous.autoApply===true)};
    if(consentState==='on'){
      learnedRules=mergeRemembered(learnedRules,[rule]);
      void saveLearnedRules([rule]).catch(memoryFailure);
    }else if(consentState==='unknown'){
      pendingLearning=mergeRemembered(pendingLearning,[rule]);
      if(!consentDialog?.open)consentDialog?.showModal();
    }
  }
  function updateLearned(rule:LearnedRule,patch:Partial<Pick<LearnedRule,'kind'|'autoApply'>>):void{
    const updated={...rule,...patch,updatedAt:Date.now()};
    learnedRules=mergeRemembered(learnedRules,[updated]);
    void saveLearnedRules([updated]).catch(memoryFailure);
  }
  function forgetLearned(key:string):void{
    learnedRules=learnedRules.filter(rule=>rule.key!==key);
    void deleteLearnedRule(key).catch(memoryFailure);
  }
  function clearMemory():void{
    if(!window.confirm('Alle dauerhaft gelernten Begriffe aus diesem Browser löschen?'))return;
    learnedRules=[];
    pendingLearning=[];
    void clearLearnedRules().catch(memoryFailure);
  }
  function scheduleReviewPrompt(jobId:number,document:ReviewedDocument):void{
    window.clearTimeout(reviewPromptTimer);
    if(reviewPromptHandled)return;
    const count=document.groups.filter(group=>group.review && group.activeCount===0
      && !ignoredTerms.some(term=>sameTerm(term,group.text))).length;
    if(count<=2)return;
    // Do not interrupt typing while CodeMirror is still receiving input.
    reviewPromptTimer=window.setTimeout(()=>{
      if(reviewPromptHandled||isAnalyzing||latestJob!==jobId||!source.trim())return;
      if(consentDialog?.open||settingsDialog?.open||findingsDialog?.open)return;
      reviewPromptHandled=true;
      reviewDialog?.showModal();
    },900);
  }
  function acceptAllSuggestions():void{
    reviewDialog?.close();
    reviewPromptHandled=true;
    const candidates:Finding[]=[];
    const terms=new Set<string>();
    for(const group of pendingGroups){
      const hit=findings.find(item=>item.kind===group.kind && sameTerm(item.text,group.text)
        && item.confidence==='review' && !ignoredPlaces.some(place=>spansOverlap(place,item)));
      if(!hit)continue;
      candidates.push({
        id:'manual-'+(++manualCounter),kind:hit.kind,text:hit.text,
        start:hit.start,end:hit.end,origin:'manual'
      });
      terms.add(normalizedKey(hit.text));
    }
    if(!candidates.length)return;
    manual=[...manual.filter(hit=>!candidates.some(candidate=>spansOverlap(candidate,hit))),...candidates];
    ignoredTerms=ignoredTerms.filter(term=>!terms.has(normalizedKey(term)));
    for(const hit of candidates)recordLearning(hit.text,hit.kind);
    notice=candidates.length+' Vorschläge übernommen. Bitte das Ergebnis prüfen.';
  }
  function reviewIndividually():void{
    reviewPromptHandled=true;
    reviewDialog?.close();
    findingsDialog?.showModal();
  }

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
        scheduleReviewPrompt(data.id,data.reviewed);
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
      manual:$state.snapshot(manual),learned:consentState==='on'?$state.snapshot(learnedRules):[],ignoredPlaces:$state.snapshot(ignoredPlaces),
      ignoredTerms:$state.snapshot(ignoredTerms),numericOrder,cityLexiconEnabled,
      rules:$state.snapshot(replacementRules),
      dateOptions:{dateShiftEnabled,offsetDays:dateOffset,numericOrder}
    };
    void analysisVersion;
    // Never reveal an earlier preview after source, rules or settings have changed.
    resultVisible=false;
    if(!source.trim()){
      window.clearTimeout(reviewPromptTimer);
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
    if(!next.trim())reviewPromptHandled=false;
  }

  function popoverPosition(anchor: {left:number;top:number;bottom:number}, width:number, height:number): {x:number;y:number} {
    const popupWidth = Math.min(width, window.innerWidth - 24);
    const popupHeight = Math.min(height, window.innerHeight - 24);
    const x = Math.max(12, Math.min(anchor.left, window.innerWidth - popupWidth - 12));
    const below = anchor.bottom + 8;
    const above = anchor.top - popupHeight - 8;
    const y = below + popupHeight <= window.innerHeight - 12 ? below
      : above >= 12 ? above
      : Math.max(12, Math.min(below, window.innerHeight - popupHeight - 12));
    return {x,y};
  }

  function onSelect(from: number, to: number, position?: {x: number; y: number; top: number}): void {
    selectedRange = {from, to};
    quickAction = to > from && position
      ? popoverPosition({left:position.x, top:position.top, bottom:position.y}, 322, 250)
      : null;
  }

  function onEditorViewportChange(): void {
    if (quickAction) {
      const anchor = markedEditor?.selectionAnchor();
      quickAction = anchor
        ? popoverPosition({left:anchor.x, top:anchor.top, bottom:anchor.y}, 322, 250)
        : null;
    }
    if (menu) {
      const anchor = markedEditor?.hitAnchor(menu.id);
      menu = anchor ? {id:menu.id, ...popoverPosition(anchor, 300, 285)} : null;
    }
  }

  /** A single click converts the actual current editor selection into a learned rule. */
  function setManualMark(start: number, end: number, kind: Kind,auto=false): void {
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
    recordLearning(added.text,kind,auto);
    ignoredPlaces = ignoredPlaces.filter(hit => !spansOverlap(hit, added));
    ignoredTerms = ignoredTerms.filter(term => !sameTerm(term, added.text));
    menu = null;
    quickAction = null;
    selectedRange = {from: 0, to: 0};
    notice = 'Auswahl anonymisiert. Der Begriff wird im ganzen Text wiedererkannt.';
  }

  function addManual(kind: Kind): void {
    setManualMark(selectedRange.from, selectedRange.to, kind,rememberAutomatically);
    rememberAutomatically=false;
  }

  function suppressOne(hit: Finding): void {
    if (!ignoredPlaces.some(entry => spansOverlap(entry, hit))) {
      exclusionCounter++;
      ignoredPlaces = [...ignoredPlaces, {...hit, id: 'ignored-' + exclusionCounter}];
    }
    menu = null;
  }

  function restoreOne(hit: Finding): void {
    if(hit.confidence==='review'){
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
    if(learnedRules.some(rule=>rule.key===normalizedKey(hit.text)))forgetLearned(normalizedKey(hit.text));
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
    for(const part of parts)recordLearning(part.text,part.kind);
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
    menu = { id, ...popoverPosition(rect, 300, 285) };
  }

  function closeMenuOutside(event: MouseEvent): void {
    if (!(event.target instanceof Element)) {
      menu = null;
      quickAction = null;
      return;
    }
    if (!event.target.closest('.hit-popover')) menu = null;
    if (!event.target.closest('.selection-popover, .marked-editor')) quickAction = null;
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
    reviewDialog?.close();
    faqDialog?.close();
    window.clearTimeout(reviewPromptTimer);
    reviewPromptHandled=false;
    rememberAutomatically=false;
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
        <div class="brand-name">Anonymat</div>
        <div class="brand-subtitle">Lokal im Browser · ohne Textübertragung</div>
      </div>
    </div>
    <div class="topbar-actions">
      <button class="faq-trigger" type="button" onclick={() => {quickAction=null;menu=null;faqDialog?.showModal();}}>Hilfe & FAQ</button>
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
        <h1>Texte pseudonymisieren</h1>
      </div>
      <button class="reset-button" type="button" onclick={resetAll} disabled={!source && !reply}>↺ <span>Neuer Text</span></button>
    </div>

    <div class="step-heading">
      <div class="step-number">1</div>
      <div>
        <h2>Text vorbereiten</h2>
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
            <div class="panel-title-row">
              <h3 id="source-title">Originaltext</h3>
              <details class="legend-help">
                <summary title="Markierungsfarben erklären" aria-label="Bedeutung der Markierungsfarben">?</summary>
                <div class="legend-tooltip">Gelb: automatisch erkannt · Blau: bitte prüfen · Grün: manuell ergänzt · Grau: ignoriert</div>
              </details>
            </div>
          </div>
          <span class="quiet-count">{source.length.toLocaleString('de-DE')} Zeichen</span>
        </div>
        <MarkedEditor bind:this={markedEditor} value={source} marks={editorMarks} onChange={onSourceChange} onSelect={onSelect} onHit={onHit} onViewportChange={onEditorViewportChange} />
        <div class="editor-actions">
          <button type="button" class="secondary-button" onclick={() => { quickAction=null; menu=null; findingsDialog?.showModal(); }}>
            Ersetzungen anzeigen ({groups.length})
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
      </div>
    </div>

    <section class="panel output-panel" aria-labelledby="result-title">
      <div class="panel-heading">
        <div>
          <h3 id="result-title">Pseudonymisierter Text</h3>
        </div>
        <button class="primary-button" type="button" onclick={copyMasked} disabled={!resultVisible || !source.trim() || isAnalyzing || !!analysisError}>
          <span aria-hidden="true">⧉</span> Text kopieren
        </button>
      </div>
      <div class="preview" aria-live="polite">
        {#if !resultVisible}
          <div class="preview-gate">
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
      {#if resultVisible && pendingGroups.length}
        <div class="inline-warning">{pendingGroups.length} mögliche Angaben sind noch nicht ersetzt. Die blau markierten Vorschläge im Originaltext können per Klick oder über „Ersetzungen anzeigen“ bestätigt oder ignoriert werden.</div>
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
      </div>
    </div>

    <div class="restore-grid">
      <section class="panel" aria-labelledby="reply-title">
        <div class="panel-heading">
          <div><h3 id="reply-title">Antwort der KI</h3></div>
        </div>
        <textarea class="reply-editor" bind:value={reply} spellcheck="false"
          placeholder="Hier die Antwort von ChatGPT oder einem anderen Tool mit [PERSON_001] usw. einfügen ..."
          aria-label="KI-Antwort mit Platzhaltern"></textarea>
      </section>
      <section class="panel" aria-labelledby="restored-title">
        <div class="panel-heading">
          <div><h3 id="restored-title">Wiederhergestellter Text</h3></div>
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

    {#if notice}<div class="toast" role="status">{notice}</div>{/if}
  </main>

  <footer class="site-footer"><span>Anonymat 2.0 Alpha · Open Source</span><span>Automatische Erkennung ist nicht vollständig – vor Weitergabe prüfen.</span></footer>

      <dialog class="findings-dialog" bind:this={findingsDialog} aria-labelledby="findings-title">
        <div class="panel-heading">
          <div>
            <h3 id="findings-title">Erkannte Angaben</h3>
          </div>
          <div class="findings-dialog-actions"><form method="dialog"><button class="settings-close" type="submit" aria-label="Ersetzungen schließen">×</button></form></div>
        </div>
        <div class="findings-body">
          {#if groups.length === 0}
            <div class="empty-state">
              <div class="empty-symbol" aria-hidden="true">⌕</div>
              <strong>Noch keine Treffer</strong>
              <p>Markiere Textstellen direkt im Originaltext.</p>
            </div>
          {:else}
            <div class="list-caption">{active.length} von {findings.length} Textstellen aktiv · {groups.length} unterschiedliche Begriffe</div>
            <div class="findings-list">
              {#each groups as group (group.key)}
                <div class="finding-row" class:muted-finding={group.activeCount === 0 && !pendingGroups.some(entry=>entry.key===group.key)}>
                  <input type="checkbox" checked={group.activeCount > 0}
                    aria-label={group.text + ' im ganzen Text anonymisieren'}
                    onchange={event => toggleGroup(group, event.currentTarget.checked)} />
                  <span class="finding-details">
                    <span class="finding-value">{group.text} {#if group.count > 1}<span class="count-inline">× {group.count}</span>{/if}</span>
                    <span class="finding-meta">{KIND_LABELS[group.kind]} · {group.manual ? 'Manuell markiert' : group.learned ? 'Aus früheren Texten' : 'Automatisch erkannt'}
                      {#if pendingGroups.some(entry=>entry.key===group.key)} · Prüfvorschlag (noch nicht ersetzt){:else if group.activeCount === 0} · Ignoriert{:else if group.activeCount < group.count} · {group.activeCount}/{group.count} aktiv{/if}
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

  <dialog class="review-dialog" bind:this={reviewDialog} aria-labelledby="review-title">
    <div class="settings-header">
      <h2 id="review-title">Anonymisierungsvorschläge</h2>
      <form method="dialog"><button type="submit" class="settings-close" aria-label="Vorschläge schließen">×</button></form>
    </div>
    <div class="settings-body">
      <p>In diesem Text wurden {pendingGroups.length} weitere Begriffe gefunden, die noch nicht anonymisiert sind. Du kannst sie gesammelt übernehmen oder einzeln prüfen.</p>
      <p>{priorSuggestions} aus früheren Texten · {patternSuggestions} aus der Mustererkennung</p>
      <p class="settings-note">Bitte prüfe auch bei einer Sammelübernahme den vollständigen Ergebnistext.</p>
    </div>
    <div class="review-actions">
      <button type="button" class="secondary-button" onclick={() => reviewDialog?.close()}>Später</button>
      <button type="button" class="secondary-button" onclick={reviewIndividually}>Einzeln prüfen</button>
      <button type="button" class="primary-button" onclick={acceptAllSuggestions}>Alle übernehmen</button>
    </div>
  </dialog>

  <dialog class="consent-dialog" bind:this={consentDialog} aria-labelledby="consent-title">
    <div class="settings-header"><h2 id="consent-title">Ersetzungen dauerhaft merken?</h2></div>
    <div class="settings-body">
      <p>Anonymat kann manuell bestätigte Begriffe samt Kategorie in diesem Browser speichern und bei neuen Texten wiedererkennen.</p>
      <p>Auch Namen und andere personenbezogene Angaben werden dabei im Klartext im Browserprofil gespeichert. Vollständige Texte und Platzhalter-Zuordnungen werden nicht gespeichert. In den Einstellungen kannst du die Regeln einzeln oder vollständig löschen.</p>
    </div>
    <div class="review-actions">
      <button type="button" class="secondary-button" disabled={learningBusy} onclick={() => {void enableMemory(false);}}>Nur diesen Text</button>
      <button type="button" class="primary-button" disabled={learningBusy} onclick={() => {void enableMemory(true);}}>{learningBusy?'Wird gespeichert…':'Lokales Gedächtnis aktivieren'}</button>
    </div>
  </dialog>

  <dialog class="faq-dialog" bind:this={faqDialog} aria-labelledby="faq-title">
    <div class="settings-header">
      <div><h2 id="faq-title">Hilfe & FAQ</h2></div>
      <form method="dialog"><button type="submit" class="settings-close" aria-label="Hilfe schließen">×</button></form>
    </div>
    <div class="faq-body settings-body">
      <section>
        <h3>Wie anonymisiere ich eine nicht erkannte Textstelle?</h3>
        <p>Markiere die Stelle im Originaltext. Im eingeblendeten Menü kannst du „Sonstiges“ für einen allgemeinen Platzhalter oder direkt eine Kategorie wie Name, Datum oder Ort wählen. Weitere Kategorien stehen im Auswahlmenü.</p>
      </section>
      <section>
        <h3>Wie korrigiere ich eine automatische Erkennung?</h3>
        <p>Klicke auf die farbig markierte Textstelle. Du kannst den Platzhalter-Typ ändern oder eine Erkennung an dieser Stelle beziehungsweise im gesamten Text ignorieren. Unter „Ersetzungen anzeigen“ lassen sich Begriffe und Ersatzwerte gesammelt prüfen.</p>
      </section>
      <section>
        <h3>Was bedeuten die Markierungsfarben?</h3>
        <p>Gelb steht für automatisch erkannte Angaben, Blau für noch nicht bestätigte Prüfvorschläge, Grün für manuell ergänzte Regeln und Grau für ignorierte Treffer.</p>
      </section>
      <section>
        <h3>Werden gleiche Begriffe mehrfach ersetzt?</h3>
        <p>Ja. Manuell markierte Begriffe werden im gesamten Text wiedererkannt. Mit aktiviertem lokalem Gedächtnis erscheinen sie auch in späteren Texten als Vorschläge. Optional kannst du eine automatische Übernahme erlauben.</p>
      </section>
      <section>
        <h3>Was passiert mit Datumsangaben?</h3>
        <p>Kalenderdaten werden standardmäßig um denselben zufälligen Tagesabstand verschoben, damit Zeitabstände erhalten bleiben. Unter „Einstellungen“ kannst du die Verschiebung ändern oder deaktivieren. Mehrdeutige Daten müssen geprüft werden.</p>
      </section>
      <section>
        <h3>Wie funktioniert die Rückübersetzung?</h3>
        <p>Kopiere den geprüften Text mit seinen Platzhaltern in ein externes Werkzeug. Füge dessen Antwort unten ein: Bekannte Platzhalter werden wieder durch die Originalangaben ersetzt. Die Platzhalter dürfen dabei nicht umbenannt werden.</p>
      </section>
      <section>
        <h3>Werden meine Texte hochgeladen oder gespeichert?</h3>
        <p>Die Verarbeitung erfolgt im Browser. Vollständige Texte und Platzhalter-Zuordnungen werden nicht dauerhaft gespeichert. Mit deiner Zustimmung werden ausschließlich manuell bestätigte Begriffe und ihre Kategorien in IndexedDB gespeichert. Auch diese können personenbezogen sein; du kannst sie in den Einstellungen löschen. Beim Neuladen wird der aktuelle Text verworfen.</p>
      </section>
      <section>
        <h3>Ist das Ergebnis wirklich anonym?</h3>
        <p>Nein, Platzhalter und verschobene Daten bewirken zunächst eine Pseudonymisierung. Indirekt identifizierende Angaben und übersehene Treffer können erhalten bleiben. Lies den vollständigen Ergebnistext vor einer externen Weitergabe kritisch durch.</p>
      </section>
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

      <section class="settings-section" aria-labelledby="settings-learning">
        <h3 id="settings-learning">Gelernte Ersetzungen</h3>
        <label class="settings-toggle">
          <input type="checkbox" checked={consentState==='on'} onchange={event=>{void enableMemory(event.currentTarget.checked);}} />
          <span><strong>Lokales Gedächtnis verwenden</strong><small>Manuell bestätigte Begriffe für zukünftige Texte speichern und wiedererkennen. Auch sensible Originalbegriffe bleiben dabei im Browserprofil gespeichert.</small></span>
        </label>
        {#if consentState==='on'}
          <p class="settings-note">{learnedRules.length} gespeicherte Begriffe. Standardmäßig sind neue Treffer nur Vorschläge, bis du sie bestätigst.</p>
          {#if learnedRules.length}
            <div class="learned-list">
              {#each learnedRules as rule (rule.key)}
                <div class="learned-row">
                  <strong title={rule.term}>{rule.term}</strong>
                  <select aria-label={'Kategorie für '+rule.term} value={rule.kind}
                    onchange={event=>updateLearned(rule,{kind:event.currentTarget.value as Kind})}>
                    {#each kinds as kind}<option value={kind}>{KIND_LABELS[kind]}</option>{/each}
                  </select>
                  <label><input type="checkbox" checked={rule.autoApply} onchange={event=>updateLearned(rule,{autoApply:event.currentTarget.checked})}/> Automatisch</label>
                  <button type="button" class="secondary-button" aria-label={'Gelernten Begriff '+rule.term+' löschen'} onclick={()=>forgetLearned(rule.key)}>Löschen</button>
                </div>
              {/each}
            </div>
            <button type="button" class="secondary-button" onclick={clearMemory}>Alle gelernten Regeln löschen</button>
          {/if}
        {:else}
          <p class="settings-note">Das Gedächtnis ist deaktiviert. Der aktuelle Text wird trotzdem wie bisher im Arbeitsspeicher verarbeitet.</p>
        {/if}
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
      onpointerdown={(event) => { if (!(event.target instanceof Element && event.target.closest('select'))) event.preventDefault(); }}
      role="dialog" tabindex="-1" aria-label="Textauswahl anonymisieren">
      <div class="selection-popover-heading">
        <strong>Auswahl anonymisieren</strong>
        <button class="popover-close" type="button" aria-label="Auswahlmenü schließen" onclick={() => quickAction = null}>×</button>
      </div>
      <button class="selection-default" type="button" onclick={() => addManual('OTHER')}>
        <strong>Sonstiges</strong><small>Allgemeiner Platzhalter</small>
      </button>
      <div class="selection-shortcuts" aria-label="Häufige Kategorien">
        {#each quickKinds as kind}
          <button type="button" onclick={() => addManual(kind)}>{KIND_LABELS[kind]}</button>
        {/each}
      </div>
      <label class="selection-remember"><input type="checkbox" bind:checked={rememberAutomatically}/> Künftig automatisch anonymisieren</label>
      <select class="selection-more" aria-label="Weitere Kategorien" value=""
        onchange={(event) => { const kind = event.currentTarget.value as Kind; if (kind) addManual(kind); }}>
        <option value="" disabled>Weitere Kategorien…</option>
        {#each extraKinds as kind}
          <option value={kind}>{KIND_LABELS[kind]}</option>
        {/each}
      </select>
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
