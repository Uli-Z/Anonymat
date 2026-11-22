<script lang="ts">
  import { onMount } from 'svelte';
  import { EditorState, StateEffect, type ChangeDesc } from '@codemirror/state';
  import { EditorView, Decoration, ViewPlugin, type ViewUpdate, type DecorationSet, keymap, placeholder } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';

  export type EditorMark = {
    id: string;
    start: number;
    end: number;
    ignored: boolean;
    review: boolean;
    manual: boolean;
  };

  interface Props {
    value: string;
    marks: EditorMark[];
    onChange: (value: string, changes: ChangeDesc) => void;
    onSelect: (from: number, to: number, position?: {x: number; y: number}) => void;
    onHit: (id: string, rect: DOMRect) => void;
  }

  let { value, marks, onChange, onSelect, onHit }: Props = $props();
  let host: HTMLDivElement;
  let view: EditorView | undefined;

  const changeMarks = StateEffect.define<EditorMark[]>();

  // Only decorate the *visible viewport*. Rendering tens of thousands of
  // CodeMirror highlights at once can block the UI even if detection is in
  // a worker. Other hits stay available via scrolling and the findings list.
  function visibleDecorations(marks:readonly EditorMark[],view:EditorView):DecorationSet{
    const ranges:ReturnType<ReturnType<typeof Decoration.mark>['range']>[]=[];
    for(const visible of view.visibleRanges){
      let lo=0,hi=marks.length;
      // Findings are sorted by start and nonoverlapping.
      while(lo<hi){
        const mid=(lo+hi)>>1;
        if(marks[mid].end<=visible.from)lo=mid+1;
        else hi=mid;
      }
      for(let i=lo;i<marks.length;i++){
        const mark=marks[i];
        if(mark.start>=visible.to)break;
        const from=Math.max(mark.start,visible.from);
        const to=Math.min(mark.end,visible.to);
        if(to<=from || to>view.state.doc.length)continue;
        ranges.push(Decoration.mark({
          class:[
            'cm-anonymat-hit',
            mark.ignored?'cm-anonymat-ignored':mark.review?'cm-anonymat-review':mark.manual?'cm-anonymat-manual':'cm-anonymat-auto'
          ].join(' '),
          attributes:{
            'data-hit-id':mark.id,
            title:mark.ignored?'Ignorierter Treffer · klicken zum Wiederherstellen':mark.review?'Möglicher Name · zur Bestätigung klicken':'Personenbezogene Angabe · klicken zum Bearbeiten'
          }
        }).range(from,to));
      }
    }
    return Decoration.set(ranges,true);
  }

  const highlights=ViewPlugin.fromClass(class {
    marks:EditorMark[]=[];
    decorations:DecorationSet=Decoration.none;
    constructor(view:EditorView){this.decorations=visibleDecorations(this.marks,view);}
    update(update:ViewUpdate){
      let changed=update.docChanged || update.viewportChanged;
      for(const tx of update.transactions){
        for(const effect of tx.effects){
          if(effect.is(changeMarks)){
            this.marks=[...effect.value].sort((a,b)=>a.start-b.start);
            changed=true;
          }
        }
      }
      if(changed)this.decorations=visibleDecorations(this.marks,update.view);
    }
  },{decorations:plugin=>plugin.decorations});

  onMount(() => {
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          EditorView.lineWrapping,
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          highlights,
          placeholder('Beispiel: Frau Anna Müller, E-Mail: anna.mueller@example.org, Telefon: +49 421 12345678 ...'),
          EditorView.contentAttributes.of({ 'aria-label': 'Originaltext', spellcheck: 'false' }),
          EditorView.updateListener.of(update => {
            if (update.docChanged) onChange(update.state.doc.toString(), update.changes);
            if (update.selectionSet || update.docChanged) {
              const { from, to } = update.state.selection.main;
              const rect = to > from ? view?.coordsAtPos(to) : null;
              onSelect(from, to, rect ? {x: rect.left, y: rect.bottom} : undefined);
            }
          }),
          EditorView.domEventHandlers({
            click(event) {
              const target = event.target instanceof Element ? event.target.closest<HTMLElement>('.cm-anonymat-hit') : null;
              const id = target?.dataset.hitId;
              if (!id || !target) return false;
              // A drag selection must stay a normal text selection.
              if (view && !view.state.selection.main.empty) return false;
              event.stopPropagation();
              onHit(id, target.getBoundingClientRect());
              return true;
            }
          })
        ]
      })
    });
    view.dispatch({ effects: changeMarks.of(marks) });
    return () => {
      view?.destroy();
      view = undefined;
    };
  });

  $effect(() => {
    const next = marks;
    if (view) view.dispatch({ effects: changeMarks.of(next) });
  });

  $effect(() => {
    const next = value;
    if (view && view.state.doc.toString() !== next) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
    }
  });

  export function focus(): void {
    view?.focus();
  }
</script>

<div class="marked-editor" bind:this={host}></div>
