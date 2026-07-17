import { useMemo, useState } from 'react';
import { Accordion, Badge, Button, Group, ScrollArea, Stack, Text, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import catalog from '../data/epgGuruCatalog.json';

export interface EpgGuruCatalogTabProps {
  onLoad: (url: string) => void;
}

interface CatalogGroup {
  key: string;
  flag: string | null;
  displayName: string;
  searchName: string;
  versions: { label: string; xmlUrl: string; gzUrl?: string }[];
}

const COUNTRY_GROUPS: CatalogGroup[] = catalog.countries.map((c) => ({
  key: `country-${c.continent}-${c.name}`,
  flag: c.flag,
  displayName: `${c.displayName} (${c.continent})`,
  searchName: c.displayName.toLowerCase(),
  versions: c.versions,
}));

const LEGACY_GROUPS: CatalogGroup[] = catalog.legacyGuides.map((g) => ({
  key: `legacy-${g.name}`,
  flag: g.flag,
  displayName: g.name,
  searchName: g.name.toLowerCase(),
  versions: g.versions,
}));

const INDIVIDUAL_GROUPS: CatalogGroup[] = catalog.individualMarkets.map((m) => ({
  key: `market-${m.name}`,
  flag: m.flag,
  displayName: m.displayName,
  searchName: m.displayName.toLowerCase(),
  versions: [{ label: 'XML', xmlUrl: m.xmlUrl }],
}));

function VersionRow({ group, onLoad }: { group: CatalogGroup; onLoad: (url: string) => void }) {
  return (
    <Stack gap={2} py={4}>
      <Text size="xs" fw={600}>
        {group.flag ? `${group.flag} ` : ''}
        {group.displayName}
      </Text>
      <Stack gap={2}>
        {group.versions.map((v) => (
          <Group key={v.label} gap={4} wrap="nowrap">
            <Text size="xs" c="dimmed" style={{ minWidth: 90 }}>
              {v.label}
            </Text>
            <Button variant="light" size="compact-xs" onClick={() => onLoad(v.xmlUrl)}>
              XML
            </Button>
            {v.gzUrl && (
              <Button variant="light" color="grape" size="compact-xs" onClick={() => onLoad(v.gzUrl!)}>
                GZ
              </Button>
            )}
          </Group>
        ))}
      </Stack>
    </Stack>
  );
}

export function EpgGuruCatalogTab({ onLoad }: EpgGuruCatalogTabProps) {
  const [search, setSearch] = useState('');

  const term = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!term) return { countries: COUNTRY_GROUPS, legacy: LEGACY_GROUPS, individual: [] as CatalogGroup[] };
    const match = (g: CatalogGroup) => g.searchName.includes(term);
    return {
      countries: COUNTRY_GROUPS.filter(match),
      legacy: LEGACY_GROUPS.filter(match),
      individual: INDIVIDUAL_GROUPS.filter(match),
    };
  }, [term]);

  return (
    <Stack gap={6} p={4}>
      <TextInput
        size="xs"
        placeholder="Search markets (e.g. 'Norway' or 'Chicago')..."
        leftSection={<IconSearch size={14} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
      />
      <ScrollArea.Autosize mah={360} type="auto">
        <Accordion multiple defaultValue={['countries']} variant="separated">
          <Accordion.Item value="countries">
            <Accordion.Control>
              <Group gap={6}>
                <Text size="xs" fw={700}>
                  Countries
                </Text>
                <Badge size="xs" variant="light">
                  {filtered.countries.length}
                </Badge>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap={0}>
                {filtered.countries.map((g) => (
                  <VersionRow key={g.key} group={g} onLoad={onLoad} />
                ))}
                {filtered.countries.length === 0 && (
                  <Text size="xs" c="dimmed">
                    No matches.
                  </Text>
                )}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="legacy">
            <Accordion.Control>
              <Group gap={6}>
                <Text size="xs" fw={700}>
                  Legacy Guides
                </Text>
                <Badge size="xs" variant="light">
                  {filtered.legacy.length}
                </Badge>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap={0}>
                {filtered.legacy.map((g) => (
                  <VersionRow key={g.key} group={g} onLoad={onLoad} />
                ))}
                {filtered.legacy.length === 0 && (
                  <Text size="xs" c="dimmed">
                    No matches.
                  </Text>
                )}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="individual">
            <Accordion.Control>
              <Group gap={6}>
                <Text size="xs" fw={700}>
                  Individual Markets (US/CA)
                </Text>
                <Badge size="xs" variant="light">
                  {term ? filtered.individual.length : INDIVIDUAL_GROUPS.length}
                </Badge>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap={0}>
                {!term && (
                  <Text size="xs" c="dimmed">
                    Type to search {INDIVIDUAL_GROUPS.length} local markets.
                  </Text>
                )}
                {(term ? filtered.individual : []).map((g) => (
                  <VersionRow key={g.key} group={g} onLoad={onLoad} />
                ))}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </ScrollArea.Autosize>
    </Stack>
  );
}
