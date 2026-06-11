# gedcom-map

A browser-based tool that reads a GEDCOM genealogy file and marks every geographical location on an embedded OpenStreetMap, with a popup describing the people and events tied to each place.

## Features

- **GEDCOM 5.x support** – reads individuals (`INDI`), families (`FAM`), and all standard event tags (birth, death, marriage, burial, residence, …).
- **GEDKeeper support** – handles `_LOC` location entities and resolves both direct `PLAC @LOC_ID@` values and child `PLAC -> _LOC @LOC_ID@` references.
- **GPS coordinates** – when the file contains `MAP`/`LATI`/`LONG` data under `PLAC` or `_LOC`, those coordinates are used directly (no network call required).
- **Geocoding fallback** – after parsing, the app shows counts of locations with/without coordinates and asks whether to geocode missing ones via [Nominatim](https://nominatim.openstreetmap.org/) (OpenStreetMap, free, no API key needed), rate-limited to 1 request / second.
- **Geocoding debug mode** – append `?logger=true` to the URL to log geocoding decisions/requests in the browser console.
- **Warnings list** – any location that cannot be resolved is listed below the map with a plain-language explanation.
- **Drag-and-drop upload** – drop a `.ged` file onto the upload area or click to browse.
- **No secrets / API keys required** – Nominatim and OpenStreetMap tiles are both free and open.

## Architecture

```
src/
├── app/
│   ├── layout.tsx         Next.js root layout (imports Leaflet CSS)
│   ├── page.tsx           Entry point – renders <GedcomApp />
│   └── globals.css        Base styles
│
├── lib/
│   ├── gedcom/
│   │   ├── types.ts       Shared TypeScript types
│   │   ├── parser.ts      Raw GEDCOM → GedcomRecord tree
│   │   └── extractor.ts   GedcomRecord tree → LocationData[]
│   └── geocoding/
│       └── nominatim.ts   Nominatim geocoding + in-memory cache
│
└── components/
    ├── GedcomApp.tsx       Orchestrator: upload → parse → geocode → display
    ├── FileUpload.tsx      Drag-and-drop file picker
    ├── MapView.tsx         Leaflet map (client-side only, dynamic import)
    └── WarningsList.tsx    Warnings section
```

### Data flow

```
User drops .ged file
        │
        ▼
FileUpload reads it as text
        │
        ▼
extractLocations() (src/lib/gedcom/extractor.ts)
  ├─ parseGedcom()  – splits GEDCOM lines into a record tree
  ├─ Resolves _LOC references (GEDKeeper)
  ├─ Extracts every PLAC tag from INDI + FAM events
  └─ Returns LocationData[] + initial warnings
        │
        ▼  (user can start/skip geocoding for locations without GPS coords)
geocodePlaceNames() (src/lib/geocoding/nominatim.ts)
  ├─ Nominatim /search (1 req/s, in-memory cache)
  └─ Merges coordinates back into LocationData[] progressively
        │
        ▼
MapView (react-leaflet + OpenStreetMap tiles)
  ├─ Places a Marker for each location that has coordinates
  ├─ Auto-fits the map viewport to all markers
  └─ Each popup shows: place name, and per-event: type, people, date

WarningsList shows locations that could not be placed on the map
```

### GEDCOM parsing

The parser (`src/lib/gedcom/parser.ts`) handles the standard line format:

```
LEVEL [XREF_ID] TAG [VALUE]
```

It builds a tree from the flat line stream, then `extractor.ts` walks the tree to collect events.

**Supported GPS format** (GEDCOM 5.5.1 `MAP` record):
```
2 PLAC London, England
3 MAP
4 LATI N51.5074
4 LONG W0.1278
```

Latitude/longitude supports both prefixes (`N`/`S` for latitude, `E`/`W` for longitude) and plain numeric values (for example `49.356590`, `20.897162`).

**GEDKeeper `_LOC` entities**:
```
0 @L1@ _LOC
1 NAME London
1 MAP
2 LATI N51.5074
2 LONG W0.1278
```

A `PLAC` tag may carry `@L1@` as its value, which is resolved to the named `_LOC` record.

## Development

```bash
yarn install        # install dependencies
yarn dev            # start Next.js dev server
yarn lint           # ESLint (flat config)
yarn test           # run Vitest unit tests
yarn type-check     # tsc --noEmit
yarn build          # production build
```

## Deployment (Vercel)

No secrets or environment variables are required. The application uses:

- **OpenStreetMap tile server** – free, no key.
- **Nominatim geocoding** – free, no key. Usage is governed by the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/); the application already enforces the required 1 request/second rate limit.

Simply connect the repository to a Vercel project and deploy.

## Development notes

- Install dependencies before starting work: `yarn install`.
- Use conventional commits for all commit messages.
- If a work item is large, split it into multiple commits.
- Keep this README updated whenever functionality or workflow changes.
