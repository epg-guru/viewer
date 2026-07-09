import { useEffect, useRef, useState } from 'react';
import { Group, Badge, Loader, Text, Button } from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconChevronDown, IconChevronUp, IconCode } from '@tabler/icons-react';
import { EditorState } from '@codemirror/state';
import { EditorView, basicSetup } from 'codemirror';
import { xml } from '@codemirror/lang-xml';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { checkWellFormed } from '../../lib/xmltv/wellFormed';
import { xmlDarkTheme } from '../../lib/codeMirrorTheme';
import { useEpgStore } from '../../state/epgStore';

export interface XmlSourceSectionProps {
  /** Changing this (e.g. a new byteStart) re-fetches the fragment. */
  target: unknown;
  byteStart: number;
  byteEnd: number;
  malformed?: boolean;
}

/** Shared well-formedness badges + collapsible raw-XML viewer, used by both
 * ChannelModal and ProgrammeModal, the two only differ in what they show
 * above this section. */
export function XmlSourceSection({ target, byteStart, byteEnd, malformed }: XmlSourceSectionProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const readFragment = useEpgStore((s) => s.readFragment);
  const [loading, setLoading] = useState(false);
  const [fragment, setFragment] = useState<string | null>(null);
  const [wellFormed, setWellFormed] = useState<{ ok: boolean; message?: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);

  // Fetch the fragment (and check well-formedness) once per target, the
  // badges show up immediately even before the user expands the XML source.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFragment(null);
    setWellFormed(null);
    setLoadError(null);
    setSourceOpen(false);

    readFragment(byteStart, byteEnd)
      .then((f) => {
        if (cancelled) return;
        setFragment(f);
        setWellFormed(checkWellFormed(f));
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // Mount CodeMirror only once the source section is actually expanded.
  useEffect(() => {
    if (!sourceOpen || fragment === null || !containerRef.current) {
      viewRef.current?.destroy();
      viewRef.current = null;
      return;
    }
    const result = checkWellFormed(fragment);
    const diagnostics: Diagnostic[] = result.ok
      ? []
      : [{ from: 0, to: fragment.length, severity: 'error', message: result.message ?? 'XML parse error' }];

    viewRef.current?.destroy();
    viewRef.current = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: fragment,
        extensions: [
          basicSetup,
          xmlDarkTheme,
          xml(),
          lintGutter(),
          linter(() => diagnostics),
          EditorView.editable.of(false),
          EditorView.theme({ '&': { maxHeight: '50vh' } }),
        ],
      }),
    });

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [sourceOpen, fragment]);

  return (
    <>
      <Group gap="xs">
        {malformed && (
          <Badge color="yellow" leftSection={<IconAlertTriangle size={12} />}>
            Ambiguous boundary at index time
          </Badge>
        )}
        {loading && <Loader size="xs" />}
        {!loading && wellFormed && (
          <Badge
            color={wellFormed.ok ? '' : 'red'}
            leftSection={wellFormed.ok ? <IconCheck size={12} /> : <IconAlertTriangle size={12} />}
          >
            {wellFormed.ok ? 'Valid XML' : `Syntax error: ${wellFormed.message ?? ''}`}
          </Badge>
        )}
        <Button
          variant="subtle"
          size="xs"
          ml="auto"
          leftSection={<IconCode size={14} />}
          rightSection={sourceOpen ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
          onClick={() => setSourceOpen((o) => !o)}
          disabled={fragment === null}
        >
          {sourceOpen ? 'Hide XML source' : 'Show XML source'}
        </Button>
      </Group>

      {loadError && (
        <Text c="red" size="sm">
          {loadError}
        </Text>
      )}

      {sourceOpen && <div ref={containerRef} />}
    </>
  );
}
