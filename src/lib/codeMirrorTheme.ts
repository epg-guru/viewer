import { EditorView } from 'codemirror';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

// CodeMirror ships a light theme by default — with no dark base theme
// supplied, the editor renders a white gutter/background inside an
// otherwise all-dark app. This wires it up against the app's actual
// Mantine dark CSS variables (not hardcoded hex) so it always matches the
// real surface, plus reuses a couple of the validated dark-mode
// categorical hexes from the dataviz palette for token distinctness (they
// were chosen for contrast against #1a1a19, effectively the app's own
// #1a1b1e background).
const baseTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--mantine-color-dark-7)',
      color: 'var(--mantine-color-dark-0)',
    },
    '.cm-content': {
      caretColor: 'var(--mantine-color-gray-0)',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--mantine-color-gray-0)',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'var(--mantine-color-blue-9)',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--mantine-color-dark-6)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--mantine-color-dark-6)',
      color: 'var(--mantine-color-dark-3)',
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--mantine-color-dark-5)',
      color: 'var(--mantine-color-dark-1)',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      color: 'inherit',
    },
    '.cm-scroller': {
      overflow: 'auto',
    },
  },
  { dark: true },
);

const highlightStyle = HighlightStyle.define([
  { tag: tags.tagName, color: '#3987e5' },
  { tag: tags.attributeName, color: '#9085e9' },
  { tag: [tags.attributeValue, tags.string], color: '#51cf66' },
  { tag: tags.angleBracket, color: 'var(--mantine-color-dark-2)' },
  { tag: tags.comment, color: 'var(--mantine-color-dark-3)', fontStyle: 'italic' },
  { tag: tags.processingInstruction, color: 'var(--mantine-color-dark-3)' },
  { tag: tags.content, color: 'var(--mantine-color-dark-0)' },
]);

export const xmlDarkTheme: Extension = [baseTheme, syntaxHighlighting(highlightStyle)];
