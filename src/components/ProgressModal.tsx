import { useEffect, useState } from 'react';
import { Modal, Text, Progress, Group, Button, Alert, Stack, Paper } from '@mantine/core';
import { IconAlertTriangle, IconX, IconCheck } from '@tabler/icons-react';
import { useEpgStore } from '../state/epgStore';

type PanelState = 'pending' | 'active' | 'done';

/** Rotating-ring status dot: spinning while active, checkmark when done, a
 * plain dimmed ring while pending. No step number — Download and Parse are
 * two independent, concurrently-active panels now (segments are dispatched
 * to the parser pool as soon as they're cut, not after the whole file
 * downloads), not a numbered sequence, so a Stepper-style 1/2 no longer
 * applies. */
function StatusDot({ state }: { state: PanelState }) {
  return (
    <span
      data-state={state}
      style={{
        width: 20,
        height: 20,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        border: `2px solid ${state === 'pending' ? 'var(--mantine-color-gray-5)' : 'var(--mantine-color-blue-6)'}`,
        background: state === 'done' ? 'var(--mantine-color-blue-6)' : 'transparent',
        color: 'var(--mantine-color-white)',
        flexShrink: 0,
      }}
    >
      {state === 'done' && <IconCheck size={12} />}
    </span>
  );
}

/** One phase's own card: a dot + label header, a detail line, and a progress
 * bar, boxed in its own Paper so Download and Parse read as two distinct
 * containers rather than one box split by a divider. Both can be 'active'
 * (spinning) at the same time since the two phases now overlap. */
function PhaseCard({
  label,
  state,
  detail,
  percent,
}: {
  label: string;
  state: PanelState;
  detail: string;
  percent: number | null;
}) {
  return (
    <Paper withBorder radius="md" p="md" shadow="md">
      <Stack gap={6}>
        <Group gap={8} wrap="nowrap">
          <StatusDot state={state} />
          <Text size="sm" fw={500} c={state === 'pending' ? 'dimmed' : undefined}>
            {label}
          </Text>
          <Text size="sm" c="dimmed" ml="auto">
            {detail}
          </Text>
        </Group>
        <Progress value={percent ?? (state === 'pending' ? 0 : 100)} animated={state === 'active' && percent === null} size="sm" />
      </Stack>
    </Paper>
  );
}

/** Whole-load-lifecycle popup: download, parse, and errors all render here
 * instead of a separate inline status block plus a separate error Alert, so
 * there's one place to look while a source loads.
 *
 * Download and parse now run concurrently (segments are dispatched to the
 * parser pool as soon as they're cut, not after the whole file downloads),
 * so this shows them as two separate card containers stacked on one shared
 * darkened backdrop, each independently able to show "in progress" at once
 * — rather than a sequential Download-then-Parse stepper, which would (and
 * did) misrepresent download as finished the moment parsing started. The
 * outer `Modal` only supplies that shared overlay/centering/escape-to-close
 * behavior; its own box chrome is stripped via `styles` so it doesn't add a
 * third, redundant container around the two cards. */
export function ProgressModal() {
  const status = useEpgStore((s) => s.status);
  const progress = useEpgStore((s) => s.progress);
  const error = useEpgStore((s) => s.error);
  const cancelLoad = useEpgStore((s) => s.cancelLoad);
  const sourceKind = useEpgStore((s) => s.sourceKind);
  // Reading a local file doesn't "download" anything — it's already on
  // disk — so label that phase to match what's actually happening.
  const downloadLabel = sourceKind === 'file' ? 'Upload' : 'Download';
  const downloadStartingLabel = sourceKind === 'file' ? 'Reading…' : 'Starting…';

  // Keeps the modal open for a beat after a successful load so the final
  // counts are visible, rather than vanishing the instant status flips.
  const [showDone, setShowDone] = useState(false);
  useEffect(() => {
    if (status !== 'ready') {
      setShowDone(false);
      return;
    }
    setShowDone(true);
    const t = setTimeout(() => setShowDone(false), 1200);
    return () => clearTimeout(t);
  }, [status]);

  const active = status === 'loading' || status === 'error';
  const opened = active || showDone;

  if (!opened) return null;

  const downloadDone = showDone || !!progress?.downloadDone;
  const parseStarted = !!progress && progress.segmentsTotal > 0;
  // Catching up to the currently-dispatched segment count doesn't mean
  // parsing is finished while download is still running — more segments
  // are still coming, so segmentsDone === segmentsTotal is just a
  // momentary lull, not completion. Parse can only be "done" once download
  // has stopped producing new segments too.
  const parseDone = showDone || (downloadDone && parseStarted && progress!.segmentsDone >= progress!.segmentsTotal);
  const downloadPercent = progress?.totalBytes
    ? Math.min(100, (progress.bytesDownloaded / progress.totalBytes) * 100)
    : null;
  const parsePercent =
    parseStarted && progress ? Math.min(100, (progress.segmentsDone / progress.segmentsTotal) * 100) : null;
  // Dismissable via backdrop/Escape once resolved (error or done); the only
  // way out mid-load is the explicit Cancel button below.
  const dismissable = status === 'error' || showDone;

  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (dismissable) cancelLoad();
      }}
      withCloseButton={false}
      closeOnClickOutside={dismissable}
      closeOnEscape={dismissable}
      centered
      padding={0}
      size="sm"
      styles={{ content: { background: 'transparent', boxShadow: 'none' }, body: { padding: 0 } }}
    >
      <style>{`
        @keyframes progress-modal-spin { to { transform: rotate(360deg); } }
        .progress-modal-status span[data-state="active"] { border-color: transparent !important; }
        .progress-modal-status span[data-state="active"]::before {
          content: '';
          position: absolute;
          inset: -2px;
          border-radius: 50%;
          border: 2px solid transparent;
          border-top-color: var(--mantine-color-blue-6);
          border-right-color: var(--mantine-color-blue-6);
          animation: progress-modal-spin 0.8s linear infinite;
        }
      `}</style>

      {status === 'error' && error ? (
        <Paper withBorder radius="md" p="md" shadow="md">
          <Alert color="red" icon={<IconAlertTriangle size={16} />} title="Couldn't load source">
            {error.message}
          </Alert>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={cancelLoad}>
              Close
            </Button>
          </Group>
        </Paper>
      ) : (
        <Stack gap="sm" className="progress-modal-status">
          <PhaseCard
            label={downloadLabel}
            state={downloadDone ? 'done' : 'active'}
            detail={
              progress
                ? `${(progress.bytesDownloaded / (1024 * 1024)).toFixed(1)} MB${
                    progress.totalBytes ? ` / ${(progress.totalBytes / (1024 * 1024)).toFixed(0)} MB` : ''
                  }`
                : downloadStartingLabel
            }
            percent={downloadDone ? 100 : downloadPercent}
          />

          <PhaseCard
            label="Parse"
            state={parseDone ? 'done' : parseStarted ? 'active' : 'pending'}
            detail={
              parseStarted
                ? `${progress!.segmentsDone.toLocaleString()} / ${progress!.segmentsTotal.toLocaleString()} segments`
                : 'Waiting for data…'
            }
            percent={parseDone ? 100 : parsePercent}
          />

          <Group justify="space-between" align="center">
            {showDone ? (
              <Text size="sm">
                {progress?.channelsSeen.toLocaleString()} channels, {progress?.programmesSeen.toLocaleString()}{' '}
                programmes loaded
              </Text>
            ) : progress ? (
              <Text size="sm" c="dimmed">
                {progress.channelsSeen.toLocaleString()} channels, {progress.programmesSeen.toLocaleString()} programmes
              </Text>
            ) : (
              <span />
            )}
            {active && (
              <Button variant="subtle" color="red" size="xs" leftSection={<IconX size={14} />} onClick={cancelLoad}>
                Cancel
              </Button>
            )}
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
