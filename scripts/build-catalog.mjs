#!/usr/bin/env node
// Fetches https://epg.guru/ and turns its embedded file listing into a
// compact, static catalog (src/data/epgGuruCatalog.json) that ships baked
// into the app bundle. The homepage renders its own listing client-side
// from two plain JSON literals sitting right in the page source (`const
// markets = {...}`, `const individualFiles = [...]`) — no API, no HTML
// scraping, just extract and parse those two literals.
//
// Run via `npm run catalog` (also runs automatically before `npm run
// build`, see package.json). Safe to re-run any time to refresh the
// catalog from the live site.

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const SITE_ORIGIN = 'https://epg.guru';
const OUTPUT_PATH = fileURLToPath(new URL('../src/data/epgGuruCatalog.json', import.meta.url));

// Flag for each `markets` country, keyed by the base filename (before
// `_Channel_List.txt` is stripped). Covers exactly what's on the site today;
// an unrecognized new entry falls back to no flag rather than a guess.
const COUNTRY_FLAGS = {
  Canada: '🇨🇦',
  'Canada-Bell': '🇨🇦',
  'Canada-Shaw': '🇨🇦',
  UnitedStates: '🇺🇸',
  'UnitedStates-Locals': '🇺🇸',
  USFast: '🇺🇸',
  Mexico: '🇲🇽',
  Finland: '🇫🇮',
  France: '🇫🇷',
  Germany: '🇩🇪',
  Italy: '🇮🇹',
  Ireland: '🇮🇪',
  UnitedKingdom: '🇬🇧',
  Netherlands: '🇳🇱',
  Norway: '🇳🇴',
  Spain: '🇪🇸',
  Sweden: '🇸🇪',
  Australia: '🇦🇺',
};

function toDisplayName(base) {
  return base
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/-/g, ' - ')
    .trim();
}

function abs(path) {
  return new URL(path, SITE_ORIGIN).toString();
}

function extractLiteral(html, varName) {
  const re = new RegExp(`const ${varName} = ([\\s\\S]*?);\\n`);
  const match = html.match(re);
  if (!match) {
    throw new Error(
      `Could not find "const ${varName} = ..." in the epg.guru homepage source — the site's structure may have changed.`,
    );
  }
  return JSON.parse(match[1]);
}

function buildCountryEntry(continent, file) {
  const base = file.replace(/(_channel_list|_Channel_List)\.txt$/, '');
  return {
    continent,
    name: base,
    displayName: toDisplayName(base),
    flag: COUNTRY_FLAGS[base] ?? null,
    channelListUrl: abs(`/IPTV_Channel_List/${file}`),
    versions: [
      {
        label: '7d Standard (GN)',
        xmlUrl: abs(`/7daygracenote/${base}.xml`),
        gzUrl: abs(`/7daygracenote/${base}.xml.gz`),
      },
      {
        label: '7d IPTV',
        xmlUrl: abs(`/7dayiptv/${base}.xml`),
        gzUrl: abs(`/7dayiptv/${base}.xml.gz`),
      },
    ],
  };
}

function buildLegacyGuides() {
  return [
    {
      name: 'United States (Legacy)',
      flag: COUNTRY_FLAGS.UnitedStates,
      channelListUrl: abs('/IPTV_Channel_List/UnitedStates-og_channel_list.txt'),
      versions: [
        { label: '14d Standard', xmlUrl: abs('/UnitedStates-og.xml'), gzUrl: abs('/UnitedStates-og.xml.gz') },
        { label: '14d IPTV', xmlUrl: abs('/iptv/UnitedStates-og.xml'), gzUrl: abs('/iptv/UnitedStates-og.xml.gz') },
      ],
    },
    {
      name: 'Canada (Legacy)',
      flag: COUNTRY_FLAGS.Canada,
      channelListUrl: abs('/IPTV_Channel_List/Canada-og_channel_list.txt'),
      versions: [
        { label: '14d Standard', xmlUrl: abs('/Canada-og.xml'), gzUrl: abs('/Canada-og.xml.gz') },
        { label: '14d IPTV', xmlUrl: abs('/iptv/Canada-og.xml'), gzUrl: abs('/iptv/Canada-og.xml.gz') },
      ],
    },
    {
      name: 'US Locals (OTA)',
      flag: COUNTRY_FLAGS.UnitedStates,
      channelListUrl: null,
      versions: [
        {
          label: '14d Standard',
          xmlUrl: abs('/UnitedStates-Locals-og.xml'),
          gzUrl: abs('/UnitedStates-Locals-og.xml.gz'),
        },
      ],
    },
  ];
}

function buildIndividualMarket(file) {
  const displayName = file.replace('.xml', '').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return {
    name: file.replace('.xml', ''),
    displayName,
    flag: file.startsWith('Canada') ? '🇨🇦' : '🇺🇸',
    xmlUrl: abs(`/${file}`),
  };
}

async function main() {
  const force = process.argv.includes('--force');
  if (!force && existsSync(OUTPUT_PATH)) {
    console.log(`${OUTPUT_PATH} already exists, skipping fetch (pass --force to refresh).`);
    return;
  }

  const res = await fetch(SITE_ORIGIN + '/');
  if (!res.ok) {
    throw new Error(`Failed to fetch ${SITE_ORIGIN}/: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();

  const markets = extractLiteral(html, 'markets');
  const individualFiles = extractLiteral(html, 'individualFiles');

  const countries = Object.entries(markets).flatMap(([continent, files]) =>
    files.map((file) => buildCountryEntry(continent, file)),
  );

  const catalog = {
    generatedAt: new Date().toISOString(),
    sourceUrl: SITE_ORIGIN + '/',
    countries,
    legacyGuides: buildLegacyGuides(),
    individualMarkets: individualFiles.map(buildIndividualMarket),
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(catalog, null, 2) + '\n', 'utf8');

  console.log(
    `Wrote ${countries.length} countries, ${catalog.legacyGuides.length} legacy guides, ` +
      `${catalog.individualMarkets.length} individual markets to ${OUTPUT_PATH}`,
  );
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
