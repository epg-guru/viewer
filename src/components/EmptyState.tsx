import { Center, Text } from '@mantine/core';

export function EmptyState() {
  return (
    <Center h="100%">
      <Text c="dimmed" size="sm">
        Enter a URL above or upload a file to load a guide.
      </Text>
    </Center>
  );
}
