import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'

const editorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--nd-bg)',
      color: 'var(--nd-fg)',
      fontSize: '0.8em',
      fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
    },
    '.cm-content': {
      caretColor: 'var(--nd-accent)',
      lineHeight: '1.6',
      padding: '4px 0',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--nd-accent)',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'var(--nd-focus)',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--nd-panelHighlight)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--nd-bg)',
      color: 'var(--nd-fg)',
      border: 'none',
      opacity: '0.35',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      opacity: '1',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 8px 0 4px',
      minWidth: '2em',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-matchingBracket': {
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      outline: '1px solid rgba(255, 255, 255, 0.3)',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--nd-popup)',
      color: 'var(--nd-fg)',
      border: '1px solid var(--nd-divider)',
      borderRadius: '6px',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: 'var(--nd-focus)',
      color: 'var(--nd-fg)',
    },
    '.cm-completionIcon': {
      opacity: '0.6',
    },
    '.cm-panels': {
      backgroundColor: 'var(--nd-panel)',
      color: 'var(--nd-fg)',
    },
    '.cm-scroller': {
      overflow: 'auto',
    },
  },
  { dark: true },
)

const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#c792ea' },
  { tag: tags.atom, color: 'var(--nd-codeBoolean)' },
  { tag: tags.string, color: 'var(--nd-codeString)' },
  { tag: tags.number, color: 'var(--nd-codeNumber)' },
  { tag: tags.comment, color: '#546e7a', fontStyle: 'italic' },
  { tag: tags.operator, color: '#89ddff' },
  { tag: tags.definition(tags.variableName), color: '#82aaff' },
  { tag: tags.namespace, color: '#ffcb6b' },
  { tag: tags.variableName, color: 'var(--nd-fg)' },
  { tag: tags.bracket, color: 'var(--nd-fg)' },
  { tag: tags.punctuation, color: 'var(--nd-fg)', opacity: '0.6' },
])

export const aiscriptTheme = [editorTheme, syntaxHighlighting(highlightStyle)]
