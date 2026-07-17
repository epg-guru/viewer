import { useEffect, useState } from 'react';
import { Modal, Stepper, Text, Progress, Group, Button, Alert, Stack } from '@mantine/core';
import { IconAlertTriangle, IconX } from '@tabler/icons-react';
import { useEpgStore } from '../state/epgStore';

/** Single blocking popup for the whole load lifecycle: download, parse, and
 * errors all render here instead of a separate inline status block plus a
 * separate error Alert, so there's one place to look while a source loads. */
export function ProgressModal() {
  const status = useEpgStore((s) => s.status);
  const progress = useEpgStore((s) => s.progress);
  const error = useEpgStore((s) => s.error);
  const cancelLoad = useEpgStore((s) => s.cancelLoad);

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

  const parsing = !!progress && progress.segmentsTotal > 0;
  const percent = progress?.totalBytes ? Math.min(100, (progress.bytesDownloaded / progress.totalBytes) * 100) : null;
  const parsePercent =
    parsing && progress ? Math.min(100, (progress.segmentsDone / progress.segmentsTotal) * 100) : null;
  const activeStep = status === 'error' ? 0 : showDone ? 2 : parsing ? 1 : 0;
  // Dismissable via close/backdrop/Escape once resolved (error or done); the
  // only way out mid-load is the explicit Cancel button below.
  const dismissable = status === 'error' || showDone;

  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (dismissable) cancelLoad();
      }}
      withCloseButton={dismissable}
      closeOnClickOutside={dismissable}
      closeOnEscape={dismissable}
      centered
      title="&nbsp;"
    >
      {status === 'error' && error ? (
        <Alert color="red" icon={<IconAlertTriangle size={16} />} title="Couldn't load source">
          {error.message}
        </Alert>
      ) : (
        <Stack gap="md" px="sm">
          {/* Mantine's built-in `loading` prop swaps the step number out for a
              spinner; we want the number to stay put with the ring around it
              spinning instead, so the progress step's circle border is
              overridden with a rotating partial ring via [data-progress]. */}
          <style>{`
            @keyframes progress-modal-spin { to { transform: rotate(360deg); } }
            .progress-modal-stepper span[data-progress] {
              position: relative;
              border-color: transparent;
            }
            .progress-modal-stepper span[data-progress]::before {
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
          <Stepper
            active={activeStep}
            size="sm"
            allowNextStepsSelect={false}
            className="progress-modal-stepper"
            styles={{
              steps: { alignItems: 'flex-start' },
              step: { flexDirection: 'column', flex: 1 },
              stepBody: { margin: 0, marginTop: 6, textAlign: 'center' },
              separator: { display: 'none' },
            }}
          >
            <Stepper.Step label="Download" />
            <Stepper.Step label="Parse" />
            <Stepper.Completed>{null}</Stepper.Completed>
          </Stepper>

          {!parsing && !showDone && (
            <Stack gap={6} align="center">
              <Text size="sm" c="dimmed" ta="center">
                {progress
                  ? `${(progress.bytesDownloaded / (1024 * 1024)).toFixed(1)} MB${
                      progress.totalBytes ? ` / ${(progress.totalBytes / (1024 * 1024)).toFixed(0)} MB` : ''
                    }`
                  : 'Starting…'}
              </Text>
              <Progress
                value={percent ?? 100}
                animated={percent === null}
                size="sm"
                style={{ width: '100%' }}
              />
            </Stack>
          )}

          {parsing && !showDone && (
            <Stack gap={6} align="center">
              <Text size="sm" c="dimmed" ta="center">
                {progress?.segmentsDone.toLocaleString()} / {progress?.segmentsTotal.toLocaleString()} segments
              </Text>
              <Progress value={parsePercent ?? 0} size="sm" style={{ width: '100%' }} />
            </Stack>
          )}

          {showDone && (
            <Text size="sm" ta="center">
              {progress?.channelsSeen.toLocaleString()} channels, {progress?.programmesSeen.toLocaleString()} programmes
              loaded
            </Text>
          )}

          {progress && !showDone && (
            <Text size="sm" c="dimmed" ta="center">
              {progress.channelsSeen.toLocaleString()} channels, {progress.programmesSeen.toLocaleString()} programmes
            </Text>
          )}
        </Stack>
      )}

      {active && status !== 'error' && (
        <Group justify="flex-end" mt="md">
          <Button variant="subtle" color="red" leftSection={<IconX size={14} />} onClick={cancelLoad}>
            Cancel
          </Button>
        </Group>
      )}
      {status === 'error' && (
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={cancelLoad}>
            Close
          </Button>
        </Group>
      )}
    </Modal>
  );
}
