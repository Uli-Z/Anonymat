<script lang="ts">
  import type { ChangeDesc } from '@codemirror/state';
  import { onMount } from 'svelte';
  import { browserLanguages, loadLanguagePreference, resolveLanguage, saveLanguagePreference, translate, translateDiagnostic, type LanguagePreference } from './lib/ui-i18n';
  import MarkedEditor from './components/MarkedEditor.svelte';
  import { KIND_LABELS, sameTerm, overlaps as spansOverlap, type Finding, type Kind, type DetectionSettings } from './lib/detect-types';
  import type { ReviewedDocument, TermGroup } from './lib/session';
  import type { AnalysisMessage, AnalysisRequest } from './lib/analysis-protocol';
  import ScanWorker from './workers/analysis.worker?worker&inline';
  import { remapFindings } from './lib/marks';
  import { restoreText, splitForPreview, type MaskedResult } from './lib/replace';
  import { splitFullName } from './lib/overrides';
  import { normalizedKey, makeRule, loadLearnedRules, saveLearnedRules, deleteLearnedRule, clearLearnedRules, type LearnedRule } from './lib/learned-rules';
  import { replacementKey, validateCustomToken, type ReplacementRule } from './lib/replacement-strategies';
  import { supportsSynthetic } from './lib/synthetic';
  import { findingsWithinSelection, applyFindingsBatch } from './lib/selection-batch';
  import { randomDateOffset, restoreShiftedDates, parseDate, calendarDayDifference, type NumericDateOrder } from './lib/dates';
  import type { MappingEntry } from './lib/replace';
  import { parsePartialDate, partialOriginalIso, nearestPartialDateOffset, restoreShiftedPartialDates, type ShiftedPartial } from './lib/partial-dates';

  let languagePreference = $state<LanguagePreference>(loadLanguagePreference());
  let language = $derived(resolveLanguage(languagePreference, browserLanguages()));
  let browserLanguage = $derived(resolveLanguage('auto', browserLanguages()));
  const t = (value:string):string => translate(language,value);
  function setLanguagePreference(value:LanguagePreference):void{
    languagePreference=value;
    saveLanguagePreference(value);
  }
  $effect(()=>{ document.documentElement.lang=language; });

  const kinds: Kind[] = ['PERSON', 'FIRST_NAME', 'LAST_NAME', 'EMAIL', 'PHONE', 'IBAN', 'DATE', 'TIME', 'ADDRESS', 'STREET', 'CITY', 'POSTAL_CODE', 'URL', 'IP', 'BIC', 'ID', 'LICENSE_PLATE', 'NUMBER', 'OTHER'];
  const quickKinds: Kind[] = ['PERSON', 'FIRST_NAME', 'LAST_NAME', 'DATE', 'CITY'];
  const extraKinds = kinds.filter(kind => kind !== 'OTHER' && !quickKinds.includes(kind));
  const detectionKinds = kinds.filter(kind => kind !== 'OTHER');

  let source = $state('');
  let manual = $state<Finding[]>([]);
  let ignoredPlaces = $state<Finding[]>([]);
  let ignoredTerms = $state<string[]>([]);
  let replacementRules = $state<Record<string, ReplacementRule>>({});
  let dateShiftEnabled = $state(true);
  // The default is a preference; per-term choices stay with the current document.
  let replacementDefault = $state<'token'|'synthetic'>('token');
  function newSyntheticSeed():number{
    const value=new Uint32Array(1);
    crypto.getRandomValues(value);
    return value[0];
  }
  let syntheticSeed = $state(newSyntheticSeed());
  let dateOffsetMode = $state<'random'|'manual'>('random');
  const FIRST_RUN_ACK_KEY = 'anonymat-first-run-ack-v2';
  let firstRunDialog: HTMLDialogElement | undefined;
  let firstRunLanguageMenu: HTMLDetailsElement | undefined;
  function chooseFirstRunLanguage(value:LanguagePreference):void{
    setLanguagePreference(value);
    if(firstRunLanguageMenu)firstRunLanguageMenu.open=false;
  }
  let firstRunConfirmed = $state(false);
  function acknowledgeFirstRun():void{
    if(!firstRunConfirmed)return;
    try{localStorage.setItem(FIRST_RUN_ACK_KEY,'accepted');}
    catch{ /* Storage may be disabled; acknowledge for this session only. */ }
    firstRunDialog?.close();
  }
  let settingsDialog: HTMLDialogElement | undefined;
  let faqDialog: HTMLDialogElement | undefined;
  let consentDialog: HTMLDialogElement | undefined;
  let reviewDialog: HTMLDialogElement | undefined;
  let consentState = $state<'unknown'|'on'|'off'>('unknown');
  let learnedRules = $state<LearnedRule[]>([]);
  let pendingLearning = $state<LearnedRule[]>([]);
  let copyWarningDialog: HTMLDialogElement | undefined;
  let copyWarningAcceptedJob = -1;
  let learningBusy = $state(false);
  let reviewPromptHandled = false;
  let reviewPromptTimer: number | undefined;
  let markedEditor: MarkedEditor | undefined;
  let findingsDialog: HTMLDialogElement | undefined;
  let resultVisible = $state(false);
  // Numbers are enabled by default in the UI; settings persist across texts.
  let enabledKinds = $state<DetectionSettings>({NUMBER:true});
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
  let selectionReplacementMode = $state<'default'|'token'|'synthetic'>('default');
  let bulkDeselectedIds = $state<string[]>([]);
  let reply = $state('');
  let notice = $state('');
  let menu = $state<{ id: string; x: number; y: number } | null>(null);
  let manualCounter = 0;
  let exclusionCounter = 0;

  let reviewed = $state<ReviewedDocument>({findings:[],active:[],pending:[],groups:[]});
  let prepared = $state<MaskedResult>({text:'',mapping:[],dates:[],partialDates:[],warnings:[],reviewSpans:[],replacementSpans:[]});
  let findings = $derived(isAnalyzing?[]:reviewed.findings);
  let active = $derived(isAnalyzing?[]:reviewed.active);
  let pending = $derived(isAnalyzing?[]:reviewed.pending);
  let groups = $derived(isAnalyzing?[]:reviewed.groups);
  let activeIds = $derived(new Set(active.map(hit=>hit.id)));
  let pendingIds = $derived(new Set(pending.map(hit=>hit.id)));
  // Only two visual states: active pseudonymization or an unconfirmed proposal.
  // Ignored findings remain manageable in the list, but are not decorated.
  let editorMarks = $derived(findings.filter(hit=>activeIds.has(hit.id)||pendingIds.has(hit.id)).map(hit => {
    const review=pendingIds.has(hit.id);
    const origin=hit.origin==='learned'?t("aus dem lokalen Gedächtnis"):
      hit.origin==='manual'?t("manuell bestätigt"):t("durch Mustererkennung");
    return {
      id:hit.id,start:hit.start,end:hit.end,review,
      ignored:false,manual:hit.origin==='manual',
      tooltip:(review?t("Vorschlag – noch nicht pseudonymisiert"):t("Wird pseudonymisiert"))
        +' · '+t(KIND_LABELS[hit.kind])+' · '+origin+t('. Klicken oder antippen zum Bearbeiten.')
    };
  }));
  let selectionHits = $derived(findingsWithinSelection(findings,selectedRange.from,selectedRange.to));
  let bulkChosenHits = $derived(selectionHits.filter(hit => !bulkDeselectedIds.includes(hit.id)));
  let pendingGroupKeys = $derived(new Set(pending.map(hit=>hit.kind+':'+normalizedKey(hit.text))));
  let pendingGroups = $derived(groups.filter(group=>pendingGroupKeys.has(group.key)));

  function mergeRemembered(existing:readonly LearnedRule[], incoming:readonly LearnedRule[]):LearnedRule[]{
    const map=new Map(existing.map(rule=>[rule.key,rule]));
    for(const rule of incoming)map.set(rule.key,rule);
    return [...map.values()].sort((a,b)=>a.term.localeCompare(b.term,'de'));
  }
  function memoryFailure():void{
    notice=t("Der lokale Regelspeicher ist nicht verfügbar. Die Markierungen gelten weiterhin für diesen Text.");
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
      const replacementPreference=localStorage.getItem('anonymat-replacement-default-v1');
      if(replacementPreference==='token'||replacementPreference==='synthetic')
        replacementDefault=replacementPreference;
      const detectionPreference=localStorage.getItem('anonymat-detection-v1');
      if(detectionPreference){
        const saved:unknown=JSON.parse(detectionPreference);
        if(saved && typeof saved==='object' && !Array.isArray(saved)){
          const next:DetectionSettings={NUMBER:true};
          for(const kind of kinds){
            const value=(saved as Record<string,unknown>)[kind];
            if(typeof value==='boolean')next[kind]=value;
          }
          enabledKinds=next;
        }
      }
    }catch{ /* Private browsing can restrict site storage. */ }
    consentState=pref;
    let firstRunAccepted=false;
    try{firstRunAccepted=localStorage.getItem(FIRST_RUN_ACK_KEY)==='accepted';}
    catch{ /* A blocked store means the warning will reappear on reload. */ }
    if(!firstRunAccepted)firstRunDialog?.showModal();
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
  function changeReplacementDefault(value:'token'|'synthetic'):void{
    replacementDefault=value;
    try{localStorage.setItem('anonymat-replacement-default-v1',value);}catch{
      // A browser without storage can still use this preference for this session.
    }
  }
  function changeDetectionKind(kind:Kind,checked:boolean):void{
    enabledKinds={...enabledKinds,[kind]:checked};
    try{localStorage.setItem('anonymat-detection-v1',JSON.stringify(enabledKinds));}catch{
      // The current tab still works when browser storage is unavailable.
    }
  }
  function recordLearning(term:string,kind:Kind):void{
    const rule=makeRule(term,kind);
    if(!rule)return;
    if(consentState==='on'){
      learnedRules=mergeRemembered(learnedRules,[rule]);
      void saveLearnedRules([rule]).catch(memoryFailure);
    }else if(consentState==='unknown'){
      pendingLearning=mergeRemembered(pendingLearning,[rule]);
      if(!consentDialog?.open)consentDialog?.showModal();
    }
  }
  function updateLearned(rule:LearnedRule,patch:Pick<LearnedRule,'kind'>):void{
    const updated={...rule,...patch,updatedAt:Date.now()};
    learnedRules=mergeRemembered(learnedRules,[updated]);
    void saveLearnedRules([updated]).catch(memoryFailure);
  }
  async function forgetLearned(key:string):Promise<void>{
    if(!learnedRules.some(rule=>rule.key===key))return;
    try{
      // Wait for a committed delete before changing the displayed rule list.
      await deleteLearnedRule(key);
      learnedRules=learnedRules.filter(rule=>rule.key!==key);
      menu=null;
      notice=t("Regel aus dem lokalen Gedächtnis gelöscht. Markierungen im aktuellen Text können durch andere Regeln bestehen bleiben.");
    }catch{memoryFailure();}
  }
  function clearMemory():void{
    if(!window.confirm(t("Alle dauerhaft gelernten Begriffe aus diesem Browser löschen?")))return;
    learnedRules=[];
    pendingLearning=[];
    void clearLearnedRules().catch(memoryFailure);
  }
  function scheduleReviewPrompt(jobId:number,document:ReviewedDocument):void{
    window.clearTimeout(reviewPromptTimer);
    if(reviewPromptHandled)return;
    const count=new Set(document.pending.map(hit=>hit.kind+':'+normalizedKey(hit.text))).size;
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
    notice=candidates.length+' '+t(candidates.length===1?'Vorschlag übernommen. Bitte das Ergebnis prüfen.':'Vorschläge übernommen. Bitte das Ergebnis prüfen.');
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
        analysisStatus=data.stage==='detect'?t("Personen, Orte und Kennnummern erkennen"):t("Treffer prüfen und Platzhalter vorbereiten");
      }else if(data.type==='result'){
        reviewed=data.reviewed;
        prepared=data.prepared;
        lastScanMs=data.elapsedMs;
        isAnalyzing=false;
        analysisError='';
        analysisProgress=100;
        analysisStatus=t("Analyse abgeschlossen");
        workerBusy=false;
        scheduleReviewPrompt(data.id,data.reviewed);
      }else if(data.type==='error'){
        analysisError=t("Die Analyse ist fehlgeschlagen: ")+data.message;
        analysisStatus=t("Analyse fehlgeschlagen");
        isAnalyzing=false;
        workerBusy=false;
      }
    };
    scanner.onerror=()=>{
      analysisError=t("Die Hintergrundanalyse ist fehlgeschlagen. Bitte erneut starten.");
      analysisStatus=t("Analyse fehlgeschlagen");
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
      ignoredTerms:$state.snapshot(ignoredTerms),numericOrder,
      cityLexiconEnabled:enabledKinds.CITY!==false,enabledKinds:$state.snapshot(enabledKinds),
      rules:$state.snapshot(replacementRules),
      dateOptions:{dateShiftEnabled,offsetDays:dateOffset,numericOrder,defaultReplacementMode:replacementDefault,syntheticSeed}
    };
    void analysisVersion;
    // Never reveal an earlier preview after source, rules or settings have changed.
    resultVisible=false;
    if(!source.trim()){
      window.clearTimeout(reviewPromptTimer);
      reviewed={findings:[],active:[],pending:[],groups:[]};
      prepared={text:'',mapping:[],dates:[],partialDates:[],warnings:[],reviewSpans:[],replacementSpans:[]};
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
    analysisStatus=t("Analyse wird vorbereitet");
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
        analysisError=t("Hintergrundanalyse nicht verfügbar. Es wurde kein Text freigegeben.");
        analysisStatus=t("Analyse fehlgeschlagen");
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
    analysisStatus=t("Abgebrochen");
    analysisError=t("Analyse abgebrochen. Zum Schutz deiner Daten ist die Ausgabe gesperrt, bis neu analysiert wurde.");
  }
  function retryAnalysis():void{
    analysisVersion++;
  }
  let hasDateOverride = $derived(Object.values(replacementRules).some(rule=>rule.mode==='shift-date'));
  let preview = $derived(splitForPreview(prepared.text,prepared.reviewSpans,prepared.replacementSpans));
  let inversePartial = $derived(restoreShiftedPartialDates(
    reply, exportSnapshot?.partialDates ?? prepared.partialDates,
    {numericOrder:replyNumericOrder,offsetDays:exportSnapshot?.offset ?? dateOffset,
      shiftedFullDates:exportSnapshot?.shiftedDates ?? prepared.dates.map(date=>date.shiftedIso)}
  ));
  let inverseDates = $derived(restoreShiftedDates(
    inversePartial.text,exportSnapshot?.shiftedDates ?? prepared.dates.map(date=>date.shiftedIso),
    exportSnapshot?.offset ?? dateOffset,
    {numericOrder:replyNumericOrder,restoreDerivedDates:(exportSnapshot?.partialDates ?? prepared.partialDates).length>0}
  ));
  let restored = $derived(restoreText(inverseDates.text,exportSnapshot?.mapping ?? prepared.mapping));
  let selectedHit = $derived(findings.find(hit => hit.id === menu?.id));
  let learnedByKey = $derived(new Map(learnedRules.map(rule=>[rule.key,rule])));
  let selectedLearnedRule = $derived(selectedHit
    ? learnedByKey.get(selectedHit.learnedRuleKey ?? normalizedKey(selectedHit.text))
    : undefined);
  // A group can still be listed after all its occurrences were excluded in
  // this document. Keep the persistent deletion action accessible there.
  let learnedRuleByGroup = $derived(new Map(findings
    .filter(hit=>hit.learnedRuleKey)
    .map(hit=>[hit.kind+':'+normalizedKey(hit.text),hit.learnedRuleKey!])));
  function learnedKeyForGroup(group:TermGroup):string|null{
    const key=learnedRuleByGroup.get(group.key) ?? normalizedKey(group.text);
    return learnedByKey.has(key)?key:null;
  }

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
    selectionReplacementMode = 'default';
    bulkDeselectedIds = [];
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
    if(from!==selectedRange.from || to!==selectedRange.to)bulkDeselectedIds=[];
    selectedRange = {from, to};
    const bulk = findingsWithinSelection(findings,from,to).length>=2;
    quickAction = to > from && position
      ? popoverPosition({left:position.x, top:position.top, bottom:position.y}, bulk?392:322, bulk?440:250)
      : null;
  }

  function onEditorViewportChange(): void {
    if (quickAction) {
      const anchor = markedEditor?.selectionAnchor();
      quickAction = anchor
        ? popoverPosition({left:anchor.x, top:anchor.top, bottom:anchor.y}, selectionHits.length>=2?392:322, selectionHits.length>=2?440:250)
        : null;
    }
    if (menu) {
      const anchor = markedEditor?.hitAnchor(menu.id);
      menu = anchor ? {id:menu.id, ...popoverPosition(anchor, 300, 285)} : null;
    }
  }

  /** A single click converts the actual current editor selection into a learned rule. */
  function setManualMark(start: number, end: number, kind: Kind): void {
    while (start < end && /\s/.test(source[start])) start++;
    while (end > start && /\s/.test(source[end - 1])) end--;
    if (start === end) {
      notice = t("Bitte zuerst einen Textbereich markieren.");
      return;
    }
    manualCounter++;
    const added: Finding = {
      id: 'manual-' + manualCounter,
      origin: 'manual',
      kind, text: source.slice(start, end), start, end
    };
    manual = [...manual.filter(hit => !spansOverlap(hit, added)), added];
    recordLearning(added.text,kind);
    ignoredPlaces = ignoredPlaces.filter(hit => !spansOverlap(hit, added));
    ignoredTerms = ignoredTerms.filter(term => !sameTerm(term, added.text));
    menu = null;
    quickAction = null;
    selectedRange = {from: 0, to: 0};
    notice = t("Auswahl wird pseudonymisiert. Bei aktiviertem Gedächtnis gilt die Regel auch für spätere Texte.");
  }

  function addManual(kind: Kind): void {
    const {from,to}=selectedRange;
    const term=source.slice(from,to).trim();
    const mode=selectionReplacementMode;
    setManualMark(from,to,kind);
    if(term && mode!=='default'){
      if(mode==='token' || supportsSynthetic(kind))setRuleMode(kind,term,mode);
      else notice=t("Für diese Kategorie ist nur ein Platzhalter möglich.");
    }
    selectionReplacementMode='default';
  }

  /** Bulk actions target only individually listed, fully contained findings. */
  function applyBulkSelection(action:'mask'|'exclude'):void{
    if(!bulkChosenHits.length)return;
    const changedCount=bulkChosenHits.length;
    const changed=applyFindingsBatch(bulkChosenHits,action,selectionReplacementMode,{
      manual,ignoredPlaces,ignoredTerms,replacementRules,manualCounter,exclusionCounter
    });
    manual=changed.manual;
    ignoredPlaces=changed.ignoredPlaces;
    ignoredTerms=changed.ignoredTerms;
    replacementRules=changed.replacementRules;
    manualCounter=changed.manualCounter;
    exclusionCounter=changed.exclusionCounter;
    quickAction=null;
    selectedRange={from:0,to:0};
    bulkDeselectedIds=[];
    selectionReplacementMode='default';
    for(const hit of changed.learned)recordLearning(hit.text,hit.kind);
    notice=changedCount+' '+t(action==='mask'
      ?'Fundstellen zur Pseudonymisierung übernommen.'
      :'Fundstellen von der Pseudonymisierung ausgenommen.');
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
    menu = null;
    notice = t("Manuelle Markierung für diesen Text entfernt. Gespeicherte Regeln bleiben bestehen.");
  }

  /** Refine an automatic full-name proposal with two anchored override rules. */
  function splitName(hit: Finding): void {
    const parts = splitFullName(hit);
    if (!parts) {
      notice = t("Vor-/Nachname kann hier nicht eindeutig getrennt werden. Bitte beide Teile einzeln markieren.");
      return;
    }
    manual = [...manual.filter(item => !spansOverlap(item, hit)), ...parts];
    for(const part of parts)recordLearning(part.text,part.kind);
    ignoredPlaces = ignoredPlaces.filter(item => !spansOverlap(item, hit));
    menu = null;
    notice = t("Vorname und Nachname getrennt. Beide Regeln gelten auch für weitere Vorkommen.");
  }

  function replacementFor(group: TermGroup): string {
    if (group.activeCount === 0) return t("Nicht ersetzt");
    const shifted = prepared.dates.find(entry=>group.kind==='DATE' && sameTerm(entry.original,group.text));
    if(shifted)return shifted.shifted;
    const partial = prepared.partialDates.find(entry=>group.kind==='DATE' && sameTerm(entry.original,group.text));
    if(partial)return partial.shifted;
    return prepared.mapping.find(entry =>
      entry.kind === group.kind && sameTerm(entry.original, group.text)
    )?.token ?? '—';
  }

  type RuleChoice = 'default'|'token'|'synthetic'|'shift-date'|'custom-token';
  function defaultModeLabel(kind:Kind):string{
    if(kind==='DATE')return dateShiftEnabled?t("Datum verschieben"):t("Platzhalter");
    if(supportsSynthetic(kind) && replacementDefault==='synthetic')return t("Pseudonym");
    return t("Platzhalter");
  }
  function ruleMode(kind:Kind,text:string):RuleChoice{
    const mode=replacementRules[replacementKey(kind,text)]?.mode;
    return mode==='shift-date'||mode==='token'||mode==='synthetic'||mode==='custom-token'?mode:'default';
  }
  function setRuleMode(kind:Kind,text:string,mode:RuleChoice):void{
    const key=replacementKey(kind,text);
    const next={...replacementRules};
    if(mode==='default')delete next[key];
    else if(mode==='shift-date' && kind==='DATE')next[key]={mode,kind:'DATE'};
    else if(mode==='synthetic' && supportsSynthetic(kind))next[key]={mode,kind};
    else if(mode==='token')next[key]={mode,kind};
    else return;
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
        replacementError=t("Bitte ein gültiges vollständiges Kalenderdatum wählen (maximal ±3650 Tage, nicht 0).");
        return;
      }
      dateOffset=offset;
      dateOffsetMode='manual';
      editingReplacement=null;
      replacementError='';
      notice=t("Tagesoffset für alle verschobenen Kalenderdaten angepasst.");
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
        replacementError = t("Der Token kommt bereits im Originaltext vor.");
        return;
      }
      const duplicate = Object.entries(replacementRules).some(([otherKey, rule]) =>
        otherKey !== key && rule.mode === 'custom-token' && rule.token === token
      );
      if (duplicate) {
        replacementError = t("Dieser Ersatzwert wird bereits für eine andere Angabe verwendet.");
        return;
      }
      replacementRules = {...replacementRules, [key]:{mode:'custom-token',kind:group.kind,token}};
    }
    editingReplacement = null;
    replacementError = '';
    notice = t("Ersatzwert aktualisiert. Rückübersetzung bleibt möglich.");
  }

  function onHit(id: string, rect: DOMRect): void {
    quickAction = null;
    menu = { id, ...popoverPosition(rect, 300, 285) };
  }

  function closeMenuOutside(event: MouseEvent): void {
    if(firstRunLanguageMenu && event.target instanceof Node && !firstRunLanguageMenu.contains(event.target)){
      firstRunLanguageMenu.open=false;
    }
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
    selectionReplacementMode = 'default';
    bulkDeselectedIds = [];
    syntheticSeed = newSyntheticSeed();
    dateShiftEnabled = true;
    dateOffsetMode = 'random';
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
    copyWarningAcceptedJob=-1;
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
    if(pending.length && copyWarningAcceptedJob!==latestJob){
      copyWarningDialog?.showModal();
      return;
    }
    const snapshot={
      mapping:prepared.mapping.map(item=>({...item})),
      shiftedDates:prepared.dates.map(item=>item.shiftedIso),
      partialDates:prepared.partialDates.map(item=>({...item})),
      offset:dateOffset
    };
    await copy(prepared.text,'Pseudonymisierter Text');
    exportSnapshot=snapshot;
  }

  async function copyDespiteSuggestions():Promise<void>{
    copyWarningAcceptedJob=latestJob;
    copyWarningDialog?.close();
    await copyMasked();
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
      notice = t(label) + ' ' + t('kopiert.');
    } catch {
      notice = t("Automatisches Kopieren nicht verfügbar. Bitte Text manuell auswählen.");
    }
  }
</script>

<svelte:head>
  <title>{t('Anonymat 2.0 · Lokale Pseudonymisierung')}</title>
  <meta name="description" content={t('Anonymat 2.0 – Texte lokal pseudonymisieren und wiederherstellen. Offline und ohne Datenübertragung.')} />
</svelte:head>

<svelte:window onclick={closeMenuOutside} onkeydown={(event) => { if (event.key === 'Escape') menu = null; quickAction = null; }} />

<div class="app-shell">
  <dialog class="first-run-dialog" bind:this={firstRunDialog} aria-labelledby="first-run-title" aria-describedby="first-run-summary" oncancel={event=>event.preventDefault()}>
    <div class="first-run-header">
      <div class="first-run-heading">
        <svg class="first-run-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" aria-hidden="true">
          <path d="M10.3 3.9 2.1 18.1a2 2 0 0 0 1.7 3h16.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>
          <path d="M12 9v4.5M12 17h.01"/>
        </svg>
        <h2 id="first-run-title">{t("Wichtiger Hinweis zur Pseudonymisierung")}</h2>
      </div>
      <details class="first-run-language" bind:this={firstRunLanguageMenu}>
        <summary class="first-run-language-toggle" aria-label={t("Sprache ändern")} title={t("Sprache ändern")}>
          <span aria-hidden="true">{language==='de'?'🇩🇪':'🇬🇧'}</span>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
        </summary>
        <div class="first-run-language-menu" role="group" aria-label={t("Sprache wählen")}>
          <div class="first-run-language-caption">{t("Sprache")}</div>
          <button type="button" class="first-run-language-choice" aria-pressed={languagePreference==='auto'} onclick={()=>chooseFirstRunLanguage('auto')}>
            <span aria-hidden="true">{browserLanguage==='de'?'🇩🇪':'🇬🇧'}</span>
            <span>{t(browserLanguage==='de'?'Automatisch (Deutsch)':'Automatisch (Englisch)')}</span>
          </button>
          <button type="button" class="first-run-language-choice" aria-pressed={languagePreference==='de'} onclick={()=>chooseFirstRunLanguage('de')}>
            <span aria-hidden="true">🇩🇪</span><span>Deutsch</span>
          </button>
          <button type="button" class="first-run-language-choice" aria-pressed={languagePreference==='en'} onclick={()=>chooseFirstRunLanguage('en')}>
            <span aria-hidden="true">🇬🇧</span><span>English</span>
          </button>
        </div>
      </details>
    </div>
    <div class="settings-body first-run-body">
      <p id="first-run-summary">{t("Anonymat unterstützt die Pseudonymisierung von Texten, garantiert aber weder eine vollständige noch eine fehlerfreie Erkennung. Persönliche Angaben können übersehen, falsch ersetzt oder durch den Zusammenhang weiterhin erkennbar sein. Das Ergebnis ist nicht automatisch anonym.")}</p>
      <p>{t("Prüfe jeden Ergebnistext vollständig, bevor du ihn kopierst oder weitergibst. Für die Freigabe und den verantwortungsvollen Umgang mit personenbezogenen Daten bist du selbst verantwortlich.")}</p>
      <p>{t("Die Verarbeitung deiner Texte erfolgt lokal im Browser auf deinem Gerät. Anonymat sendet diese Texte nicht an einen Server. Erst wenn du Inhalte selbst kopierst oder an externe Dienste weitergibst, verlassen sie diesen Bereich. Das optionale Gedächtnis speichert einzelne bestätigte Begriffe nur in deinem Browserprofil.")}</p>
      <label class="first-run-ack">
        <input type="checkbox" bind:checked={firstRunConfirmed} />
        <span>{t("Ich habe den Hinweis gelesen und verstanden.")}</span>
      </label>
    </div>
    <div class="review-actions">
      <button type="button" class="primary-button" disabled={!firstRunConfirmed} onclick={acknowledgeFirstRun}>{t("Verstanden – Anonymat starten")}</button>
    </div>
  </dialog>
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
        <div class="brand-subtitle">{t("Lokal im Browser · ohne Textübertragung")}</div>
      </div>
    </div>
    <div class="topbar-actions">
      <button class="faq-trigger" type="button" onclick={() => {quickAction=null;menu=null;faqDialog?.showModal();}}>{t("Hilfe & FAQ")}</button>
      <button class="settings-trigger" type="button" onclick={() => settingsDialog?.showModal()} aria-label={t("Einstellungen öffnen")}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/><circle cx="12" cy="12" r="4"/></svg>
        <span>{t("Einstellungen")}</span>
      </button>
      <a class="github-link" href="https://github.com/Uli-Z/Anonymat" target="_blank" rel="noopener noreferrer">GitHub <span aria-hidden="true">↗</span></a>
    </div>
  </header>

  <main class="main-content">
    <div class="page-heading">
      <div>
        <h1>{t("Texte pseudonymisieren")}</h1>
      </div>
      <button class="reset-button" type="button" onclick={resetAll} disabled={!source && !reply}>↺ <span>{t("Neuer Text")}</span></button>
    </div>

    <div class="step-heading">
      <div class="step-number">1</div>
      <div>
        <h2>{t("Text vorbereiten")}</h2>
      </div>
    </div>

    {#if isAnalyzing || analysisError}
      <section class="analysis-banner" aria-label={t("Analysefortschritt")} role="status">
        <div class="analysis-banner-content">
          <div>
            <strong>{analysisError ? t("Analyse unterbrochen") : t("Text wird geprüft…")}</strong>
            <p>{t(analysisError || analysisStatus)}</p>
          </div>
          {#if isAnalyzing}
            <button type="button" class="secondary-button" onclick={cancelAnalysis}>{t("Abbrechen")}</button>
          {:else}
            <button type="button" class="secondary-button" onclick={retryAnalysis}>{t("Erneut analysieren")}</button>
          {/if}
        </div>
        {#if isAnalyzing}
          <progress value={analysisProgress} max="100" aria-label={t("Analysefortschritt")}></progress>
        {/if}
      </section>
    {/if}

    <div class="editing-workspace">
      <section class="panel editor-panel" aria-labelledby="source-title">
        <div class="panel-heading">
          <div>
            <div class="panel-title-row">
              <h3 id="source-title">{t("Originaltext")}</h3>
              <details class="legend-help">
                <summary title={t("Markierungsfarben erklären")} aria-label={t("Bedeutung der Markierungsfarben")}>?</summary>
                <div class="legend-tooltip">{t("Grün: wird pseudonymisiert. Orange mit gestrichelter Linie: Vorschlag, bisher nicht ersetzt. Klicken oder antippen zeigt Details.")}</div>
              </details>
            </div>
          </div>
          <span class="quiet-count">{source.length.toLocaleString(language==='de'?'de-DE':'en-US')} {t('Zeichen')}</span>
        </div>
        <MarkedEditor bind:this={markedEditor} language={language} value={source} marks={editorMarks} onChange={onSourceChange} onSelect={onSelect} onHit={onHit} onViewportChange={onEditorViewportChange} />
        <div class="editor-actions">
          <button type="button" class="secondary-button" onclick={() => { quickAction=null; menu=null; findingsDialog?.showModal(); }}>
            {#if pendingGroups.length}{t('Vorschläge prüfen')} ({pendingGroups.length}){:else}{t('Ersetzungen anzeigen')} ({groups.length}){/if}
          </button>
          <button type="button" class="primary-button" onclick={openResult} disabled={!source.trim() || isAnalyzing || !!analysisError}>
            {t("Ergebnis prüfen")} <span aria-hidden="true">↓</span>
          </button>
        </div>
      </section>
    </div>

    <div class="step-heading second-step">
      <div class="step-number">2</div>
      <div>
        <h2>{t("Ergebnis prüfen")}</h2>
      </div>
    </div>

    <section class="panel output-panel" aria-labelledby="result-title">
      <div class="panel-heading">
        <div>
          <h3 id="result-title">{t("Pseudonymisierter Text")}</h3>
        </div>
        <button class="primary-button" type="button" onclick={copyMasked} disabled={!resultVisible || !source.trim() || isAnalyzing || !!analysisError}>
          <span aria-hidden="true">⧉</span> {t("Text kopieren")}
        </button>
      </div>
      <div class="preview" aria-live="polite">
        {#if !resultVisible}
          <div class="preview-gate">
            <button type="button" class="secondary-button" onclick={openResult} disabled={!source.trim() || isAnalyzing || !!analysisError}>{t("Pseudonymisierten Text anzeigen")}</button>
          </div>
        {:else if isAnalyzing}
          <span class="preview-empty">{t("Analyse läuft – vor der vollständigen Prüfung wird kein Text freigegeben.")}</span>
        {:else if analysisError}
          <span class="preview-empty">{t("Analyse nicht abgeschlossen. Bitte erneut analysieren.")}</span>
        {:else if source.trim()}
          {#each preview as part}
            {#if part.review}
              <button type="button" class="preview-suggestion" title={t("Vorschlag – noch nicht pseudonymisiert. Zur Prüfung klicken.")} onclick={reviewIndividually}>{part.value}</button>
            {:else if part.replaced}
              <span class:placeholder-token={part.mode==='token'}
                class:replacement-mark={part.mode!=='token'}
                class:shifted-date-mark={part.mode==='shift-date'}
                title={part.mode==='shift-date'?t("Verschobenes Datum"):part.mode==='synthetic'?t("Ersetzt durch Pseudonym"):t("Ersetzt durch Platzhalter")}>{part.value}</span>
            {:else if part.token}<span class="placeholder-token">{part.value}</span>{:else}{part.value}{/if}
          {/each}
        {:else}
          <span class="preview-empty">{t("Hier erscheint die Vorschau mit den ersetzten Angaben.")}</span>
        {/if}
      </div>
      {#if resultVisible && pending.length}
        <div class="proposal-review-banner" role="status">
          <div class="proposal-review-copy">
            <strong>{pendingGroups.length} {pendingGroups.length===1?t('Vorschlag ist'):t('Vorschläge sind')} {t('noch ungeprüft')}</strong>
            <p>{t("Orange markierte Angaben stehen weiterhin unverändert im Text und können Personen identifizierbar machen.")}</p>
          </div>
          <button type="button" class="secondary-button" onclick={reviewIndividually}>{t("Vorschläge prüfen")}</button>
        </div>
      {/if}
      {#if resultVisible && prepared.warnings.length}
        <div class="inline-warning">{prepared.warnings.map(message=>translateDiagnostic(language,message)).join(' ')}</div>
      {/if}
      {#if resultVisible && source.trim() && !isAnalyzing && !analysisError && prepared.mapping.length === 0 && prepared.dates.length === 0 && prepared.partialDates.length === 0}
        <div class="inline-warning">{t("Es sind keine Angaben markiert. Bitte prüfe den Originaltext, bevor du ihn weitergibst.")}</div>
      {/if}
    </section>

    <div class="step-heading third-step">
      <div class="step-number">3</div>
      <div>
        <h2>{t("KI-Ergebnis zurückübersetzen")}</h2>
      </div>
    </div>

    <div class="restore-grid">
      <section class="panel" aria-labelledby="reply-title">
        <div class="panel-heading">
          <div><h3 id="reply-title">{t("Antwort der KI")}</h3></div>
        </div>
        <textarea class="reply-editor" bind:value={reply} spellcheck="false"
          placeholder={t("Hier die Antwort von ChatGPT oder einem anderen Tool mit [PERSON_001] usw. einfügen ...")}
          aria-label={t("KI-Antwort mit Platzhaltern")}></textarea>
      </section>
      <section class="panel" aria-labelledby="restored-title">
        <div class="panel-heading">
          <div><h3 id="restored-title">{t("Wiederhergestellter Text")}</h3></div>
          <button class="secondary-button" type="button" disabled={!reply.trim()} onclick={() => copy(restored.text, 'Wiederhergestellter Text')}>⧉ {t('Kopieren')}</button>
        </div>
        <div class="restore-preview">{#if reply.trim()}{restored.text}{:else}<span class="preview-empty">{t("Die Rückübersetzung wird hier angezeigt.")}</span>{/if}</div>
        {#if reply.trim() && (inverseDates.warnings.length || inversePartial.warnings.length)}
          <div class="inline-warning">{[...inversePartial.warnings,...inverseDates.warnings].map(message=>translateDiagnostic(language,message)).join(' ')}</div>
        {/if}
        {#if reply.trim() && (restored.missing.length || restored.unknown.length)}
          <div class="inline-warning">
            {#if restored.missing.length}{t('Nicht wiedergefunden:')} {restored.missing.join(', ')}. {/if}
            {#if restored.unknown.length}{t('Unbekannte Tokens:')} {restored.unknown.join(', ')}.{/if}
            {t('Bitte das Ergebnis prüfen.')}
          </div>
        {/if}
      </section>
    </div>

    {#if notice}<div class="toast" role="status">{t(notice)}</div>{/if}
  </main>

  <footer class="site-footer"><span>Anonymat 2.0 Alpha · Open Source</span><span>{t("Automatische Erkennung ist nicht vollständig – vor Weitergabe prüfen.")}</span></footer>

      <dialog class="findings-dialog" bind:this={findingsDialog} aria-labelledby="findings-title">
        <div class="panel-heading">
          <div>
            <h3 id="findings-title">{t("Erkannte Angaben")}</h3>
          </div>
          <div class="findings-dialog-actions"><form method="dialog"><button class="settings-close" type="submit" aria-label={t("Ersetzungen schließen")}>×</button></form></div>
        </div>
        <div class="findings-body">
          {#if groups.length === 0}
            <div class="empty-state">
              <div class="empty-symbol" aria-hidden="true">⌕</div>
              <strong>{t("Noch keine Treffer")}</strong>
              <p>{t("Markiere Textstellen direkt im Originaltext.")}</p>
            </div>
          {:else}
            <div class="list-caption">{active.length} {t('von')} {findings.length} {t('Textstellen aktiv')} · {groups.length} {t('unterschiedliche Begriffe')}</div>
            <div class="findings-list">
              {#each groups as group (group.key)}
                <div class="finding-row" class:muted-finding={group.activeCount === 0 && !pendingGroups.some(entry=>entry.key===group.key)}>
                  <input type="checkbox" checked={group.activeCount > 0}
                    aria-label={group.text + ' '+t('im ganzen Text pseudonymisieren')}
                    onchange={event => toggleGroup(group, event.currentTarget.checked)} />
                  <span class="finding-details">
                    <span class="finding-value">{group.text} {#if group.count > 1}<span class="count-inline">× {group.count}</span>{/if}</span>
                    <span class="finding-meta">{t(KIND_LABELS[group.kind])} · {group.manual ? t("Manuell bestätigt") : group.learned ? t("Lokal gelernt") : t("Mustererkennung")}
                      {#if pendingGroups.some(entry=>entry.key===group.key)} · {t('Vorschlag – nicht pseudonymisiert')}{:else if group.activeCount === 0} · {t('Ignoriert')}{:else if group.activeCount < group.count} · {group.activeCount}/{group.count} {t('aktiv')}{/if}
                    </span>
                    {#if group.activeCount > 0}
                      {#if editingReplacement === replacementKey(group.kind,group.text)}
                        <form class="replacement-editor" onsubmit={(event) => { event.preventDefault(); saveReplacement(group); }}>
                          <input type="text" aria-label={t('Ersatzwert für ')+group.text} bind:value={replacementDraft} spellcheck="false" />
                          <button type="submit">{t("Speichern")}</button>
                          <button type="button" onclick={() => editingReplacement = null}>{t("Abbrechen")}</button>
                          {#if group.kind==='DATE' && prepared.dates.some(item=>sameTerm(item.original,group.text))}
                            <div>{t("Ändert den gemeinsamen Tagesoffset für alle verschobenen Daten.")}</div>
                          {/if}
                          {#if replacementError}<div class="replacement-error">{t(replacementError)}</div>{/if}
                        </form>
                      {:else}
                        <div class="replacement-inline">
                          <span class="replacement-arrow" aria-hidden="true">→</span>
                          <code>{replacementFor(group)}</code>
                          <button type="button" aria-label={t('Ersatzwert für ')+group.text+t(' bearbeiten')} onclick={() => editReplacement(group)}>{t("Ändern")}</button>
                        </div>
                      {/if}
                    {/if}
                    {#if pendingGroupKeys.has(group.key) && group.activeCount>0}
                      <button type="button" class="restore-group-button" onclick={()=>{
                        const candidate=pending.find(hit=>hit.kind===group.kind && sameTerm(hit.text,group.text));
                        if(candidate)setManualMark(candidate.start,candidate.end,candidate.kind);
                      }}>{t("Offenen Vorschlag übernehmen")}</button>
                    {/if}
                    {#if group.activeCount>0 && group.activeCount<group.count}
                      <button type="button" class="restore-group-button" onclick={() => toggleGroup(group,true)}>{t("Alle Stellen wieder ersetzen")}</button>
                    {/if}
                    {#if learnedKeyForGroup(group)}
                      <button type="button" class="forget-learned-button"
                        aria-label={t('Aus lokalem Gedächtnis löschen: ')+group.text}
                        title={t("Dauerhafte Regel für zukünftige Texte löschen")}
                        onclick={() => {const key=learnedKeyForGroup(group);if(key)void forgetLearned(key);}}>
                        {t("Aus Gedächtnis löschen")}
                      </button>
                    {/if}
                    {#if group.activeCount>0}
                      <label class="replacement-mode-control">
                        {t("Ersetzen durch")}
                        <select aria-label={t('Ersetzungsmethode für ')+group.text}
                          value={ruleMode(group.kind,group.text)}
                          onchange={event => setRuleMode(group.kind,group.text,event.currentTarget.value as RuleChoice)}>
                          <option value="default">{t('Standard')} ({defaultModeLabel(group.kind)})</option>
                          <option value="token">{t("Platzhalter")}</option>
                          {#if supportsSynthetic(group.kind)}<option value="synthetic">{t("Pseudonym")}</option>{/if}
                          {#if group.kind==='DATE'}<option value="shift-date">{t("Datum verschieben")}</option>{/if}
                          {#if ruleMode(group.kind,group.text)==='custom-token'}<option value="custom-token">{t("Eigener Platzhalter")}</option>{/if}
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

  <dialog class="copy-warning-dialog" bind:this={copyWarningDialog} aria-labelledby="copy-warning-title">
    <div class="settings-header">
      <h2 id="copy-warning-title">{t("Ungeprüfte Vorschläge im Text")}</h2>
      <form method="dialog"><button type="submit" class="settings-close" aria-label={t("Kopierwarnung schließen")}>×</button></form>
    </div>
    <div class="settings-body">
      <p>{#if pendingGroups.length===1}{t('Ein Vorschlag ist noch ungeprüft und steht im pseudonymisierten Text unverändert.')}{:else}{pendingGroups.length} {t('Vorschläge sind noch ungeprüft und stehen im pseudonymisierten Text unverändert.')}{/if}</p>
      <p>{t("Der Text kann dadurch identifizierende Angaben enthalten. Bitte prüfe ihn, bevor du ihn weitergibst.")}</p>
      <div class="copy-warning-terms" aria-label={t("Ungeprüfte Begriffe")}>
        {#each pendingGroups.slice(0,5) as group}
          <span>{group.text}</span>
        {/each}
        {#if pendingGroups.length>5}<span>{t('und')} {pendingGroups.length-5} {t('weitere')}</span>{/if}
      </div>
    </div>
    <div class="review-actions">
      <button type="button" class="secondary-button" onclick={() => copyWarningDialog?.close()}>{t("Abbrechen")}</button>
      <button type="button" class="secondary-button" onclick={() => {copyWarningDialog?.close();reviewIndividually();}}>{t("Vorschläge prüfen")}</button>
      <button type="button" class="primary-button" onclick={() => {void copyDespiteSuggestions();}}>{t("Trotzdem kopieren")}</button>
    </div>
  </dialog>

  <dialog class="review-dialog" bind:this={reviewDialog} aria-labelledby="review-title">
    <div class="settings-header">
      <h2 id="review-title">{t("Vorschläge zur Pseudonymisierung")}</h2>
      <form method="dialog"><button type="submit" class="settings-close" aria-label={t("Vorschläge schließen")}>×</button></form>
    </div>
    <div class="settings-body">
      <p>{t('Die Mustererkennung hat')} {pendingGroups.length} {t('mögliche personenbezogene Begriffe gefunden. Sie wurden noch nicht pseudonymisiert.')}</p>
      <p>{t("Du kannst alle übernehmen oder die Vorschläge einzeln prüfen.")}</p>
      <p class="settings-note">{t("Bitte prüfe auch bei einer Sammelübernahme den vollständigen Ergebnistext.")}</p>
    </div>
    <div class="review-actions">
      <button type="button" class="secondary-button" onclick={() => reviewDialog?.close()}>{t("Später")}</button>
      <button type="button" class="secondary-button" onclick={reviewIndividually}>{t("Einzeln prüfen")}</button>
      <button type="button" class="primary-button" onclick={acceptAllSuggestions}>{t("Alle übernehmen")}</button>
    </div>
  </dialog>

  <dialog class="consent-dialog" bind:this={consentDialog} aria-labelledby="consent-title">
    <div class="settings-header"><h2 id="consent-title">{t("Ersetzungen dauerhaft merken?")}</h2></div>
    <div class="settings-body">
      <p>{t("Anonymat kann manuell bestätigte Begriffe samt Kategorie in diesem Browser speichern. In zukünftigen Texten werden diese Begriffe dann automatisch pseudonymisiert, ohne erneut nachzufragen.")}</p>
      <p>{t("Auch Namen und andere personenbezogene Angaben werden dabei im Klartext im Browserprofil gespeichert. Vollständige Texte und Platzhalter-Zuordnungen werden nicht gespeichert. In den Einstellungen kannst du die Regeln einzeln oder vollständig löschen.")}</p>
    </div>
    <div class="review-actions">
      <button type="button" class="secondary-button" disabled={learningBusy} onclick={() => {void enableMemory(false);}}>{t("Nur diesen Text")}</button>
      <button type="button" class="primary-button" disabled={learningBusy} onclick={() => {void enableMemory(true);}}>{learningBusy?t("Wird gespeichert…"):t("Lokales Gedächtnis aktivieren")}</button>
    </div>
  </dialog>

  <dialog class="faq-dialog" bind:this={faqDialog} aria-labelledby="faq-title">
    <div class="settings-header">
      <div><h2 id="faq-title">{t("Hilfe & FAQ")}</h2></div>
      <form method="dialog"><button type="submit" class="settings-close" aria-label={t("Hilfe schließen")}>×</button></form>
    </div>
    <div class="faq-body settings-body">
      <section>
        <h3>{t("Wofür ist Anonymat da?")}</h3>
        <p>{t("Anonymat hilft dir, Texte zu pseudonymisieren: Persönliche Angaben werden durch Platzhalter oder erfundene Ersatzidentitäten ersetzt, Datumsangaben können verschoben werden. Du kannst den Text danach für die Nutzung mit einer KI vorbereiten.")}</p>
      </section>
      <section>
        <h3>{t("Warum läuft Anonymat im Browser?")}</h3>
        <p>{t("Dein Browser lädt das Programm wie eine Webseite und führt es dann auf deinem eigenen Gerät aus. Du musst nichts installieren.")}</p>
      </section>
      <section>
        <h3>{t("Werden meine Texte oder Änderungen übertragen?")}</h3>
        <p>{t("Nein. Anonymat verarbeitet deine Eingaben auf deinem Gerät und sendet sie nicht an den Server. Erst wenn du einen Text selbst an einen anderen Dienst weitergibst, verlässt er diesen geschützten Bereich.")}</p>
      </section>
      <section>
        <h3>{t("Wird etwas gespeichert?")}</h3>
        <p>{t("Dein aktueller Text und die Zuordnungen zu Platzhaltern werden nicht dauerhaft gespeichert. Mit deiner Zustimmung speichert das lokale Gedächtnis einzelne bestätigte Originalbegriffe im Browser und pseudonymisiert sie bei neuen Texten automatisch. Diese Begriffe kannst du jederzeit löschen.")}</p>
      </section>
      <section>
        <h3>{t("Warum heißt es Anonymat, obwohl nur pseudonymisiert wird?")}</h3>
        <p>{t("„Anonymat“ ist der kurze Programmname, keine Garantie für Anonymität. Das Programm pseudonymisiert: Es ersetzt oder verändert direkte Angaben wie Namen und Daten. Auch neue Namen und Orte sind nur Ersatzwerte – durch verbleibende Informationen oder Zusammenhänge können Personen weiterhin erkennbar sein. Eine echte Anonymisierung erfordert, dass eine Identifizierung praktisch nicht mehr möglich ist.")}</p>
      </section>
      <section>
        <h3>{t("Kann ich mich auf das Ergebnis verlassen?")}</h3>
        <p>{t("Nein, nicht ohne eigene Prüfung. Anonymat kann Angaben übersehen, Vorschläge unbestätigt lassen oder Zusammenhänge übersehen, durch die Personen erkennbar bleiben. Das Programm ist nur ein Hilfsmittel zur Pseudonymisierung. Du bist selbst dafür verantwortlich, den gesamten Text zu prüfen, bevor du ihn weitergibst.")}</p>
      </section>
    </div>
  </dialog>

  <dialog class="settings-dialog" bind:this={settingsDialog} aria-labelledby="settings-title">
    <div class="settings-header">
      <div>
        <h2 id="settings-title">{t("Einstellungen")}</h2>
        <p>{t("Erkennung, Datumsangaben und Rückübersetzung")}</p>
      </div>
      <form method="dialog">
        <button type="submit" class="settings-close" aria-label={t("Einstellungen schließen")}>×</button>
      </form>
    </div>
    <div class="settings-body">
      <section class="settings-section" aria-labelledby="settings-language">
        <h3 id="settings-language">{t('Sprache')}</h3>
        <div class="settings-field">
          <label for="ui-language">{t('Benutzerschnittstelle')}</label>
          <select id="ui-language" value={languagePreference}
            onchange={event=>setLanguagePreference(event.currentTarget.value as LanguagePreference)}>
            <option value="auto">{browserLanguage==='de'?'🇩🇪':'🇬🇧'} {t(browserLanguage==='de'?'Automatisch (Deutsch)':'Automatisch (Englisch)')}</option>
            <option value="de">🇩🇪 Deutsch</option>
            <option value="en">🇬🇧 English</option>
          </select>
        </div>
      </section>
      <section class="settings-section" aria-labelledby="settings-replacement">
        <h3 id="settings-replacement">{t("Ersetzungen")}</h3>
        <div class="settings-field">
          <label for="replacement-default">{t("Standard für Namen und Orte")}</label>
          <select id="replacement-default" value={replacementDefault}
            onchange={event=>changeReplacementDefault(event.currentTarget.value as 'token'|'synthetic')}>
            <option value="token">{t("Platzhalter, z. B. [PERSON_001]")}</option>
            <option value="synthetic">{t("Pseudonyme, z. B. andere Namen oder Orte")}</option>
          </select>
          <p>{t("Gilt für Personen, Vor- und Nachnamen, Straßen, Adressen und Orte. Andere Angaben bleiben Platzhalter. Einzelne Fundstellen können abweichend eingestellt werden.")}</p>
        </div>
      </section>
      <section class="settings-section" aria-labelledby="settings-dates">
        <h3 id="settings-dates">{t("Datumsangaben")}</h3>
        <label class="settings-toggle">
          <input type="checkbox" bind:checked={dateShiftEnabled}/>
          <span><strong>{t("Kalenderdaten verschieben")}</strong><small>{t("Standardmäßig aktiv. Vollständige Datumsangaben erhalten denselben Tagesversatz, sodass Zeitabstände erhalten bleiben.")}</small></span>
        </label>
        {#if dateShiftEnabled || hasDateOverride}
          <div class="settings-field">
            <label for="date-shift-mode">{t("Verschiebung")}</label>
            <select id="date-shift-mode" value={dateOffsetMode}
              onchange={event => {
                dateOffsetMode = event.currentTarget.value as 'random'|'manual';
                if (dateOffsetMode === 'random') dateOffset = randomDateOffset();
              }}>
              <option value="random">{t("Zufällig (empfohlen)")}</option>
              <option value="manual">{t("Manuell festlegen")}</option>
            </select>
            {#if dateOffsetMode === 'manual'}
              <div class="settings-offset-row">
                <label for="date-offset">{t("Tage")}</label>
                <input id="date-offset" type="number" min="-3650" max="3650" step="1" bind:value={dateOffset}/>
              </div>
              {#if !Number.isSafeInteger(dateOffset) || dateOffset === 0 || Math.abs(dateOffset) > 3650}
                <p class="settings-error">{t("Eine ganze Zahl von −3650 bis +3650, ausgenommen 0, eingeben.")}</p>
              {/if}
            {:else}
              <div class="settings-random-row">
                <p>{t("Der genaue Wert bleibt verborgen. Für einen neuen Text wird er automatisch neu gewählt. Datumsangaben ohne Jahr erhalten intern ein festes Kalenderjahr.")}</p>
                <button type="button" class="secondary-button" onclick={() => dateOffset = randomDateOffset()}>{t("Neuen Zufallswert wählen")}</button>
              </div>
            {/if}
          </div>
        {/if}
        <div class="settings-field">
          <label for="source-date-order">{t("Mehrdeutige Zahlenformate im Original")}</label>
          <select id="source-date-order" bind:value={numericOrder}>
            <option value="auto">{t("Nicht verändern und warnen")}</option>
            <option value="DMY">{t("Tag/Monat/Jahr")}</option>
            <option value="MDY">{t("Monat/Tag/Jahr (US)")}</option>
          </select>
        </div>
        <p class="settings-note">{t("Verschobene Daten sind pseudonymisiert, nicht vollständig anonymisiert. Bitte auf indirekte Identifizierbarkeit prüfen.")}</p>
      </section>

      <section class="settings-section" aria-labelledby="settings-detection">
        <h3 id="settings-detection">{t("Automatische Erkennung")}</h3>
        <div class="detection-category-grid">
          {#each detectionKinds as kind}
            <label class="detection-category-option">
              <input type="checkbox" checked={enabledKinds[kind]!==false}
                onchange={event=>changeDetectionKind(kind,event.currentTarget.checked)}/>
              <span>{t(KIND_LABELS[kind])}</span>
            </label>
          {/each}
        </div>
        <p class="settings-note">{t("Das Ausschalten verhindert die automatische Erkennung in dieser Kategorie. Manuelle Markierungen bleiben möglich.")}</p>
        <details class="settings-details">
          <summary>{t("Lexika und Quellen")}</summary>
          <p>{#if lexiconCounts}
            {lexiconCounts.first.toLocaleString(language==='de'?'de-DE':'en-US')} {t('Vornamen')} ·
            {lexiconCounts.last.toLocaleString(language==='de'?'de-DE':'en-US')} {t('Nachnamen')} ·
            {lexiconCounts.streets.toLocaleString(language==='de'?'de-DE':'en-US')} {t('Straßen')} ·
            {lexiconCounts.cities.toLocaleString(language==='de'?'de-DE':'en-US')} {t('Orte (davon')} {lexiconCounts.cityHomonyms.toLocaleString(language==='de'?'de-DE':'en-US')} {t('mehrdeutige Namen).')}
          {:else}
            {t('Die Größenangaben der Lexika erscheinen nach der ersten Analyse.')}
          {/if}</p>
          <p>{t("GeoNames (CC BY 4.0), Universal Dependencies German-GSD (CC BY-SA 4.0), Onomaverse (CC BY 4.0), OpenStreetMap / OpenPLZ (ODbL 1.0). Alle Daten sind offline eingebettet.")}</p>
          {#if lastScanMs !== null}<p>{t('Letzter vollständiger Scan:')} {lastScanMs.toFixed(0)} ms.</p>{/if}
        </details>
      </section>

      <section class="settings-section" aria-labelledby="settings-learning">
        <h3 id="settings-learning">{t("Gelernte Ersetzungen")}</h3>
        <label class="settings-toggle">
          <input type="checkbox" checked={consentState==='on'} onchange={event=>{void enableMemory(event.currentTarget.checked);}} />
          <span><strong>{t("Manuelle Ersetzungen merken")}</strong><small>{t("Bestätigte Begriffe werden künftig automatisch pseudonymisiert. Die Originalbegriffe bleiben lokal im Browserprofil gespeichert.")}</small></span>
        </label>
        {#if consentState==='on'}
          <p class="settings-note">{learnedRules.length} {learnedRules.length===1?t('gespeicherter Begriff. Er wird in zukünftigen Texten automatisch pseudonymisiert.'):t('gespeicherte Begriffe. Sie werden in zukünftigen Texten automatisch pseudonymisiert.')}</p>
          {#if learnedRules.length}
            <div class="learned-list">
              {#each learnedRules as rule (rule.key)}
                <div class="learned-row">
                  <strong title={rule.term}>{rule.term}</strong>
                  <select aria-label={t('Kategorie für ')+rule.term} value={rule.kind}
                    onchange={event=>updateLearned(rule,{kind:event.currentTarget.value as Kind})}>
                    {#each kinds as kind}<option value={kind}>{t(KIND_LABELS[kind])}</option>{/each}
                  </select>
                  <button type="button" class="secondary-button" aria-label={t('Gelernten Begriff ')+rule.term+t(' löschen')} onclick={()=>forgetLearned(rule.key)}>{t("Löschen")}</button>
                </div>
              {/each}
            </div>
            <button type="button" class="secondary-button" onclick={clearMemory}>{t("Alle gelernten Regeln löschen")}</button>
          {/if}
        {:else}
          <p class="settings-note">{t("Das Gedächtnis ist deaktiviert. Der aktuelle Text wird trotzdem wie bisher im Arbeitsspeicher verarbeitet.")}</p>
        {/if}
      </section>

      <section class="settings-section" aria-labelledby="settings-reply">
        <h3 id="settings-reply">{t("Rückübersetzung")}</h3>
        <div class="settings-field">
          <label for="reply-date-order">{t("Mehrdeutige Zahlenformate in KI-Antworten")}</label>
          <select id="reply-date-order" bind:value={replyNumericOrder}>
            <option value="auto">{t("Nicht verändern und warnen")}</option>
            <option value="DMY">{t("Tag/Monat/Jahr")}</option>
            <option value="MDY">{t("Monat/Tag/Jahr (US)")}</option>
          </select>
          <p>{t("Bei übersetzten Datumsangaben kann eine andere Tag-Monat-Reihenfolge nötig sein.")}</p>
        </div>
      </section>
    </div>
    <div class="settings-footer">
      <span>{t("Änderungen werden direkt lokal übernommen.")}</span>
      <form method="dialog"><button type="submit" class="primary-button">{t("Schließen")}</button></form>
    </div>
  </dialog>

  {#if quickAction && selectedRange.to > selectedRange.from && !menu}
    <div class={'selection-popover'+(selectionHits.length>=2?' selection-popover--bulk':'')} style={'left:' + quickAction.x + 'px;top:' + quickAction.y + 'px'}
      onpointerdown={(event) => { if (!(event.target instanceof Element && event.target.closest('select,input,label'))) event.preventDefault(); }}
      role="dialog" tabindex="-1" aria-label={t("Textauswahl pseudonymisieren")}>
      <div class="selection-popover-heading">
        <strong>{selectionHits.length>=2 ? selectionHits.length+' '+t("Fundstellen in Auswahl") : t("Auswahl pseudonymisieren")}</strong>
        <button class="popover-close" type="button" aria-label={t("Auswahlmenü schließen")} onclick={() => quickAction = null}>×</button>
      </div>
      {#if selectionHits.length>=2}
        <div class="selection-bulk-list" aria-label={t("Fundstellen im markierten Bereich")}>
          {#each selectionHits as hit (hit.id)}
            <label class="selection-bulk-item">
              <input type="checkbox" checked={!bulkDeselectedIds.includes(hit.id)}
                aria-label={t("Fundstelle auswählen: ")+hit.text}
                onchange={event=>bulkDeselectedIds=event.currentTarget.checked
                  ? bulkDeselectedIds.filter(id=>id!==hit.id)
                  : [...bulkDeselectedIds,hit.id]}/>
              <span class="selection-bulk-item-text">
                <strong title={hit.text}>{hit.text}</strong>
                <small>{t(KIND_LABELS[hit.kind])} · {pendingIds.has(hit.id)?t("Vorschlag"):activeIds.has(hit.id)?t("Wird pseudonymisiert"):t("Nicht ersetzt")}</small>
              </span>
            </label>
          {/each}
        </div>
        {#if bulkDeselectedIds.length}
          <button type="button" class="selection-bulk-select-all" onclick={()=>bulkDeselectedIds=[]}>{t("Alle auswählen")}</button>
        {/if}
        <label class="selection-mode-control">
          {t("Ersetzen durch")}
          <select aria-label={t("Ersetzung für Textauswahl")} bind:value={selectionReplacementMode}>
            <option value="default">{t("Standard")}</option>
            <option value="token">{t("Platzhalter")}</option>
            <option value="synthetic">{t("Pseudonym (Namen und Orte)")}</option>
          </select>
        </label>
        <div class="selection-bulk-actions">
          <button type="button" class="selection-bulk-confirm" disabled={!bulkChosenHits.length} onclick={()=>applyBulkSelection('mask')}>{t("Ausgewählte pseudonymisieren")} ({bulkChosenHits.length})</button>
          <button type="button" class="selection-bulk-ignore" disabled={!bulkChosenHits.length} onclick={()=>applyBulkSelection('exclude')}>{t("Ausgewählte nicht ersetzen")}</button>
        </div>
      {:else}
      <label class="selection-mode-control">
        {t("Ersetzen durch")}
        <select aria-label={t("Ersetzung für Textauswahl")} bind:value={selectionReplacementMode}>
          <option value="default">{t("Standard")}</option>
          <option value="token">{t("Platzhalter")}</option>
          <option value="synthetic">{t("Pseudonym (Namen und Orte)")}</option>
        </select>
      </label>
      <button class="selection-default" type="button" onclick={() => addManual('OTHER')}>
        <strong>{t("Sonstiges")}</strong><small>{t("Allgemeiner Platzhalter")}</small>
      </button>
      <div class="selection-shortcuts" aria-label={t("Häufige Kategorien")}>
        {#each quickKinds as kind}
          <button type="button" onclick={() => addManual(kind)}>{t(KIND_LABELS[kind])}</button>
        {/each}
      </div>
      <select class="selection-more" aria-label={t("Weitere Kategorien")} value=""
        onchange={(event) => { const kind = event.currentTarget.value as Kind; if (kind) addManual(kind); }}>
        <option value="" disabled>{t("Weitere Kategorien…")}</option>
        {#each extraKinds as kind}
          <option value={kind}>{t(KIND_LABELS[kind])}</option>
        {/each}
      </select>
      {/if}
    </div>
  {/if}

  {#if menu && selectedHit}
    <button class="hit-sheet-backdrop" type="button" aria-label={t("Bearbeitungsmenü schließen")} onclick={() => menu=null}></button>
    <div class="hit-popover" role="dialog" aria-label={t("Markierung bearbeiten")} style={'left:' + menu.x + 'px;top:' + menu.y + 'px'}>
      <div class="hit-popover-heading">
        <span class="hit-popover-title">{selectedHit.text}</span>
        <button type="button" class="hit-close" aria-label={t("Schließen")} onclick={() => menu = null}>×</button>
      </div>
      <label class="hit-type-label" for="hit-kind">{t("Platzhalter-Typ")}</label>
      <select id="hit-kind" class="hit-type-select" value={selectedHit.kind}
        onchange={event => changeKind(selectedHit!, event.currentTarget.value as Kind)}>
        {#each kinds as kind}
          <option value={kind}>{t(KIND_LABELS[kind])}</option>
        {/each}
      </select>
      <div class="hit-actions">
        {#if !isActive(selectedHit)}
          <p class="hit-status hit-status-review">{t("Vorschlag – noch nicht pseudonymisiert")}</p>
          <button type="button" onclick={() => restoreOne(selectedHit!)}>{t("Vorschlag übernehmen")}</button>
          <button type="button" onclick={() => ignoreEverywhere(selectedHit!)}>{t("Vorschlag verwerfen")}</button>
        {:else}
          <p class="hit-status hit-status-active">{t("Wird pseudonymisiert")}</p>
          <label class="hit-type-label" for="hit-replacement-mode">{t("Ersetzen durch")}</label>
          <select id="hit-replacement-mode" class="hit-type-select" value={ruleMode(selectedHit.kind,selectedHit.text)}
            onchange={event=>setRuleMode(selectedHit!.kind,selectedHit!.text,event.currentTarget.value as RuleChoice)}>
            <option value="default">{t('Standard')} ({defaultModeLabel(selectedHit.kind)})</option>
            <option value="token">{t("Platzhalter")}</option>
            {#if supportsSynthetic(selectedHit.kind)}<option value="synthetic">{t("Pseudonym")}</option>{/if}
            {#if selectedHit.kind==='DATE'}<option value="shift-date">{t("Datum verschieben")}</option>{/if}
            {#if ruleMode(selectedHit.kind,selectedHit.text)==='custom-token'}<option value="custom-token">{t("Eigener Platzhalter")}</option>{/if}
          </select>
          <button type="button" onclick={() => suppressOne(selectedHit!)}>{t("Nur diese Stelle nicht ersetzen")}</button>
          <button type="button" onclick={() => ignoreEverywhere(selectedHit!)}>{t("Begriff im ganzen Text nicht ersetzen")}</button>
        {/if}
        {#if splitFullName(selectedHit)}
          <button type="button" onclick={() => splitName(selectedHit!)}>↳ {t('In Vorname und Nachname aufteilen')}</button>
        {/if}
        {#if selectedLearnedRule}
          <button type="button" class="forget-learned-button"
            title={t("Dauerhaft gespeicherte Regel löschen. Das Ignorieren einzelner Stellen bleibt davon unabhängig.")}
            onclick={() => {if(selectedLearnedRule)void forgetLearned(selectedLearnedRule.key);}}>
            {t("Aus Gedächtnis löschen")}
          </button>
        {/if}
        {#if manual.some(anchor => anchor.id === selectedHit?.id)}
          <button type="button" onclick={() => removeManualRule(selectedHit!)}>− {t('Manuelle Erkennungsregel entfernen')}</button>
        {/if}
      </div>
    </div>
  {/if}
</div>
