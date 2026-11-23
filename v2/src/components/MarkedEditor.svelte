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
    tooltip: string;
  };

  interface Props {
    value: string;
    marks: EditorMark[];
    onChange: (value: string, changes: ChangeDesc) => void;
    onSelect: (from: number, to: number, position?: {x: number; y: number; top: number}) => void;
    onHit: (id: string, rect: DOMRect) => void;
    onViewportChange: () => void;
  }

  let { value, marks, onChange, onSelect, onHit, onViewportChange }: Props = $props();
  let host: HTMLDivElement;
  let view: EditorView | undefined;
  let selectionFrame = 0;
  let viewportFrame = 0;

  function nativeSelectionRect(): DOMRect | undefined {
    if (!view) return undefined;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0
      || !view.dom.contains(selection.anchorNode) || !view.dom.contains(selection.focusNode)) return undefined;
    const rects = selection.getRangeAt(0).getClientRects();
    return rects.length ? rects[rects.length - 1] : undefined;
  }

  function scheduleSelectionSync(): void {
    window.cancelAnimationFrame(selectionFrame);
    selectionFrame = window.requestAnimationFrame(() => {
      selectionFrame = 0;
      if (!view) return;
      const {from,to} = view.state.selection.main;
      onSelect(from,to,selectionAnchor());
    });
  }

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
            mark.review?'cm-anonymat-review':'cm-anonymat-active',
            mark.manual?'cm-anonymat-manual':'cm-anonymat-auto'
          ].join(' '),
          attributes:{
            'data-hit-id':mark.id,
            title:mark.tooltip
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
              // The initial selection must remain available even while
              // CodeMirror is still laying out the selection during typing.
              const rect = to > from ? (nativeSelectionRect() ?? view?.coordsAtPos(to)) : null;
              onSelect(from, to, rect ? {x: rect.left, y: rect.bottom, top: rect.top} : undefined);
              if (to > from) scheduleSelectionSync();
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
    // CodeMirror scrolls inside its own scroller. Fixed-position menus must
    // track the actual text coordinates rather than the original mouse event.
    const notifyViewport = () => {
      window.cancelAnimationFrame(viewportFrame);
      viewportFrame = window.requestAnimationFrame(() => {
        viewportFrame = 0;
        onViewportChange();
      });
    };
    view.scrollDOM.addEventListener('scroll', notifyViewport, { passive: true });
    window.addEventListener('scroll', notifyViewport, true);
    window.addEventListener('resize', notifyViewport);
    return () => {
      window.cancelAnimationFrame(selectionFrame);
      window.cancelAnimationFrame(viewportFrame);
      view?.scrollDOM.removeEventListener('scroll', notifyViewport);
      window.removeEventListener('scroll', notifyViewport, true);
      window.removeEventListener('resize', notifyViewport);
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

  function visibleAt(rect: { top: number; bottom: number; left: number; right: number }): boolean {
    if (!view) return false;
    const scroller = view.scrollDOM.getBoundingClientRect();
    return rect.bottom > Math.max(scroller.top, 0)
      && rect.top < Math.min(scroller.bottom, window.innerHeight)
      && rect.right > Math.max(scroller.left, 0)
      && rect.left < Math.min(scroller.right, window.innerWidth);
  }

  export function selectionAnchor(): { x: number; y: number; top: number } | undefined {
    if (!view || view.state.selection.main.empty) return undefined;
    // A DOM range reflects the painted selection even when CodeMirror has not
    // yet measured the caret position for this editor transaction.
    const native = nativeSelectionRect();
    if (native && visibleAt(native)) {
      return {x: native.right, y: native.bottom, top: native.top};
    }
    const rect = view.coordsAtPos(view.state.selection.main.to);
    return rect ? { x: rect.left, y: rect.bottom, top: rect.top } : undefined;
  }

  export function hitAnchor(id: string): DOMRect | undefined {
    if (!view) return undefined;
    for (const span of view.dom.querySelectorAll<HTMLElement>('.cm-anonymat-hit')) {
      if (span.dataset.hitId !== id) continue;
      const rect = span.getBoundingClientRect();
      if (visibleAt(rect)) return rect;
    }
    return undefined;
  }

  export function focus(): void {
    view?.focus();
  }
</script>

<div class="marked-editor" bind:this={host}></div>
