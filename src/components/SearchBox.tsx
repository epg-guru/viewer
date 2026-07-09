import { TextInput, ActionIcon } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconSearch, IconX } from '@tabler/icons-react';

const COMPACT_QUERY = '(max-width: 640px)';

export interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBox({ value, onChange }: SearchBoxProps) {
  const isCompact = useMediaQuery(COMPACT_QUERY) ?? false;

  return (
    <TextInput
      placeholder="Search…"
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      leftSection={<IconSearch size={16} />}
      rightSection={
        value ? (
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => onChange('')} aria-label="Clear search">
            <IconX size={14} />
          </ActionIcon>
        ) : null
      }
      style={isCompact ? { flex: 1, minWidth: 160 } : { width: 260 }}
    />
  );
}
