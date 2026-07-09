import { TextInput, ActionIcon } from '@mantine/core';
import { IconSearch, IconX } from '@tabler/icons-react';

export interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBox({ value, onChange }: SearchBoxProps) {
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
      style={{ flex: 1, minWidth: 160 }}
    />
  );
}
