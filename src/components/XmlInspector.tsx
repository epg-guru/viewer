import { useEffect, useRef, useState } from 'react';
import { Modal, Group, Text, Badge, Loader, Stack, Image, Button, Divider } from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconChevronDown, IconChevronUp, IconCode } from '@tabler/icons-react';
import { EditorState } from '@codemirror/state';
import { EditorView, basicSetup } from 'codemirror';
import { xml } from '@codemirror/lang-xml';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { checkWellFormed } from '../lib/xmltv/wellFormed';
import { xmlDarkTheme } from '../lib/codeMirrorTheme';
import { parseXmltvTime } from '../lib/xmltv/time';
import { validateImageUrl } from '../lib/urlValidation';
import { useEpgStore } from '../state/epgStore';
import type { InspectTarget } from './GuideGrid';

export interface XmlInspectorProps {
  target: InspectTarget | null;
  onClose: () => void;
}

function formatTimeRange(startRaw: string, stopRaw: string): string {
  const start = parseXmltvTime(startRaw);
  const stop = parseXmltvTime(stopRaw);
  if (start === null || stop === null) return `${startRaw} – ${stopRaw}`;
  const dateFmt: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
  const timeFmt: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  const startDate = new Date(start);
  const stopDate = new Date(stop);
  const sameDay = startDate.toDateString() === stopDate.toDateString();
  const startStr = `${startDate.toLocaleDateString([], dateFmt)} · ${startDate.toLocaleTimeString([], timeFmt)}`;
  const stopStr = sameDay
    ? stopDate.toLocaleTimeString([], timeFmt)
    : `${stopDate.toLocaleDateString([], dateFmt)} · ${stopDate.toLocaleTimeString([], timeFmt)}`;
  return `${startStr} – ${stopStr}`;
}

export function XmlInspector({ target, onClose }: XmlInspectorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const readFragment = useEpgStore((s) => s.readFragment);
  const [loading, setLoading] = useState(false);
  const [fragment, setFragment] = useState<string | null>(null);
  const [wellFormed, setWellFormed] = useState<{ ok: boolean; message?: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);

  const byteStart = target?.kind === 'channel' ? target.channel.byteStart : target?.programme.byteStart;
  const byteEnd = target?.kind === 'channel' ? target.channel.byteEnd : target?.programme.byteEnd;
  const malformed = target?.kind === 'channel' ? target.channel.malformed : target?.programme.malformed;

  // Fetch the fragment (and check well-formedness) once per target — the
  // badges show up immediately even before the user expands the XML source.
  useEffect(() => {
    if (!target || byteStart === undefined || byteEnd === undefined) return;
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

  if (!target) return null;

  const title = target.kind === 'channel' ? target.channel.displayName || target.channel.id : target.programme.title || '(untitled)';
  const icon = target.kind === 'channel' ? validateImageUrl(target.channel.icon) : validateImageUrl(target.channelIcon);

  return (
    <Modal opened onClose={onClose} title={title} size="xl">
      <Stack gap="lg">
        <Group align="flex-start" gap="md" wrap="nowrap">
          {icon ? (
            <Image src={icon} w={64} h={64} fit="contain" radius="sm" style={{ flexShrink: 0 }} />
          ) : (
            <div style={{ width: 64, height: 64, flexShrink: 0 }} />
          )}
          <Stack gap={4} style={{ flex: 1 }}>
            {target.kind === 'channel' ? (
              <Text size="xs" c="dimmed" ff="monospace">
                {target.channel.gnid && target.channel.gnid !== target.channel.id
                  ? `${target.channel.id} · ${target.channel.gnid}`
                  : target.channel.id}
              </Text>
            ) : (
              <>
                {target.programme.subTitle && <Text c="dimmed">{target.programme.subTitle}</Text>}
                <Group gap={6}>
                  {target.programme.category && (
                    <Badge variant="light" size="sm">
                      {target.programme.category}
                    </Badge>
                  )}
                  <Text size="sm" c="dimmed">
                    {target.channelName}
                  </Text>
                </Group>
                <Text size="sm">{formatTimeRange(target.programme.start, target.programme.stop)}</Text>
              </>
            )}
          </Stack>
        </Group>

        {target.kind === 'programme' && target.programme.desc && (
          <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
            {target.programme.desc}
          </Text>
        )}

        <Divider />

        <Group gap="xs">
          {malformed && (
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
      </Stack>
    </Modal>
  );
}
