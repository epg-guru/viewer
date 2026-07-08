import { Text, type TextProps } from '@mantine/core';

export interface HighlightTextProps extends TextProps {
  text: string;
  query: string;
}

/** Renders text with the first case-insensitive match of `query` wrapped in
 * a <mark>. Falls back to plain text when there's no query or no match. */
export function HighlightText({ text, query, ...textProps }: HighlightTextProps) {
  if (!query) return <Text {...textProps}>{text}</Text>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <Text {...textProps}>{text}</Text>;

  return (
    <Text {...textProps}>
      {text.slice(0, idx)}
      <mark
        style={{
          background: 'var(--mantine-color-yellow-4)',
          color: 'black',
          borderRadius: 2,
          padding: '0 1px',
        }}
      >
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </Text>
  );
}
