import { useEffect, useRef, useState } from 'react';
import { Modal, Group, Text, Badge, Loader, Stack } from '@mantine/core';
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { EditorState } from '@codemirror/state';
import { EditorView, basicSetup } from 'codemirror';
import { xml } from '@codemirror/lang-xml';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { checkWellFormed } from '../lib/xmltv/wellFormed';
import { useEpgStore } from '../state/epgStore';
import type { InspectTarget } from './GuideGrid';

export interface XmlInspectorProps {
  target: InspectTarget | null;
  onClose: () => void;
}

export function XmlInspector({ target, onClose }: XmlInspectorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const readFragment = useEpgStore((s) => s.readFragment);
  const [loading, setLoading] = useState(false);
  const [wellFormed, setWellFormed] = useState<{ ok: boolean; message?: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setLoading(true);
    setWellFormed(null);
    setLoadError(null);

    readFragment(target.byteStart, target.byteEnd)
      .then((fragment) => {
        if (cancelled) return;
        const result = checkWellFormed(fragment);
        setWellFormed(result);

        const diagnostics: Diagnostic[] = [];
        if (!result.ok) {
          diagnostics.push({
            from: 0,
            to: fragment.length,
            severity: 'error',
            message: result.message ?? 'XML parse error',
          });
        }

        viewRef.current?.destroy();
        if (containerRef.current) {
          viewRef.current = new EditorView({
            parent: containerRef.current,
            state: EditorState.create({
              doc: fragment,
              extensions: [
                basicSetup,
                xml(),
                lintGutter(),
                linter(() => diagnostics),
                EditorView.editable.of(false),
                EditorView.theme({ '&': { maxHeight: '60vh' }, '.cm-scroller': { overflow: 'auto' } }),
              ],
            }),
          });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [target, readFragment]);

  return (
    <Modal opened={target !== null} onClose={onClose} title={target?.label ?? ''} size="xl">
      <Stack gap="xs">
        <Group gap="xs">
          {target?.malformed && (
            <Badge color="yellow" leftSection={<IconAlertTriangle size={12} />}>
              Ambiguous boundary at index time
            </Badge>
          )}
          {loading && <Loader size="xs" />}
          {!loading && wellFormed && (
            <Badge
              color={wellFormed.ok ? 'teal' : 'red'}
              leftSection={wellFormed.ok ? <IconCheck size={12} /> : <IconAlertTriangle size={12} />}
            >
              {wellFormed.ok ? 'Well-formed' : `Syntax error: ${wellFormed.message ?? ''}`}
            </Badge>
          )}
        </Group>
        {loadError && (
          <Text c="red" size="sm">
            {loadError}
          </Text>
        )}
        <div ref={containerRef} />
      </Stack>
    </Modal>
  );
}
