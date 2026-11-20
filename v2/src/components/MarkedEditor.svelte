<script lang="ts">
  import { onMount } from 'svelte';
  import { EditorState, StateEffect, StateField, type ChangeDesc } from '@codemirror/state';
  import { EditorView, Decoration, type DecorationSet, keymap, placeholder } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';

  export type EditorMark = {
    id: string;
    start: number;
    end: number;
    ignored: boolean;
    manual: boolean;
  };

  interface Props {
    value: string;
    marks: EditorMark[];
    onChange: (value: string, changes: ChangeDesc) => void;
    onSelect: (from: number, to: number) => void;
    onHit: (id: string, rect: DOMRect) => void;
  }

  let { value, marks, onChange, onSelect, onHit }: Props = $props();
  let host: HTMLDivElement;
  let view: EditorView | undefined;

  const changeMarks = StateEffect.define<EditorMark[]>();

  function toDecorations(marks: EditorMark[], length: number): DecorationSet {
    const ranges = marks
      .filter(item => item.start >= 0 && item.end <= length && item.start < item.end)
      .map(item => Decoration.mark({
        class: [
          'cm-anonymat-hit',
          item.ignored ? 'cm-anonymat-ignored' : item.manual ? 'cm-anonymat-manual' : 'cm-anonymat-auto'
        ].join(' '),
        attributes: {
          'data-hit-id': item.id,
          title: item.ignored ? 'Ignorierter Treffer · klicken zum Wiederherstellen' : 'Personenbezogene Angabe · klicken zum Bearbeiten'
        }
      }).range(item.start, item.end));
    return Decoration.set(ranges, true);
  }

  const highlights = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(current, transaction) {
      let next = current.map(transaction.changes);
      for (const effect of transaction.effects) {
        if (effect.is(changeMarks)) next = toDecorations(effect.value, transaction.state.doc.length);
      }
      return next;
    },
    provide: field => EditorView.decorations.from(field)
  });

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
              onSelect(from, to);
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
