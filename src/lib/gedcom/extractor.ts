import { parseGedcom, findChild, findChildren, childValue } from "./parser";
import type { GedcomRecord, GedcomNode, GpsCoords, LocationData, PlaceEvent, GedcomParseResult } from "./types";

/** Map of GEDCOM event tags to human-readable labels */
const EVENT_LABELS: Record<string, string> = {
  BIRT: "Birth",
  DEAT: "Death",
  BURI: "Burial",
  BAPM: "Baptism",
  RESI: "Residence",
  MARR: "Marriage",
  DIV: "Divorce",
  ENGA: "Engagement",
  ADOP: "Adoption",
  CHR: "Christening",
  CONF: "Confirmation",
  FCOM: "First Communion",
  ORDN: "Ordination",
  NATU: "Naturalisation",
  EMIG: "Emigration",
  IMMI: "Immigration",
  CENS: "Census",
  PROB: "Probate",
  WILL: "Will",
  GRAD: "Graduation",
  RETI: "Retirement",
  EVEN: "Event",
  OCCU: "Occupation",
  EDUC: "Education",
  CAST: "Caste",
  DSCR: "Description",
  IDNO: "ID Number",
  NATI: "Nationality",
  NCHI: "Number of children",
  NMR: "Number of marriages",
  PROP: "Property",
  RELI: "Religion",
  SSN: "SSN",
  TITL: "Title",
};

/** All event tags we want to extract for individuals */
const INDI_EVENT_TAGS = new Set([
  "BIRT", "DEAT", "BURI", "BAPM", "CHR", "RESI", "CONF", "FCOM",
  "ORDN", "NATU", "EMIG", "IMMI", "CENS", "PROB", "WILL", "GRAD",
  "RETI", "ADOP", "EVEN", "OCCU", "EDUC",
]);

/** All event tags we want to extract for families */
const FAM_EVENT_TAGS = new Set(["MARR", "DIV", "ENGA", "EVEN"]);

/** Parse LATI/LONG values like "N51.5074" or "W74.0060" into decimal degrees */
function parseCoord(value: string, posMark: string, negMark: string): number | null {
  const upper = value.trim().toUpperCase();
  const sign = upper.startsWith(negMark) ? -1 : upper.startsWith(posMark) ? 1 : null;
  if (sign === null) return null;
  const num = parseFloat(upper.slice(1));
  return isNaN(num) ? null : sign * num;
}

/** Extract GPS coordinates from a MAP node (children: LATI, LONG) */
function extractCoords(mapNode: GedcomNode): GpsCoords | null {
  const latiStr = childValue(mapNode.children, "LATI");
  const longStr = childValue(mapNode.children, "LONG");
  if (!latiStr || !longStr) return null;

  const lat = parseCoord(latiStr, "N", "S");
  const lon = parseCoord(longStr, "E", "W");
  if (lat === null || lon === null) return null;

  return { lat, lon };
}

/** Parse GPS coordinates from a PLAC node (which may have a child MAP node) */
function coordsFromPlac(placNode: GedcomNode): GpsCoords | null {
  const mapNode = findChild(placNode.children, "MAP");
  if (!mapNode) return null;
  return extractCoords(mapNode);
}

/** Format a person's name from GEDCOM NAME value "Given /Surname/" */
function formatName(nameValue: string): string {
  return nameValue.replace(/\//g, "").replace(/\s+/g, " ").trim() || "Unknown";
}

/** Normalise a place name for grouping (lower-case, trim, collapse spaces) */
function normalisePlaceName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Extract all location data from a parsed GEDCOM file.
 */
export function extractLocations(gedcomText: string): GedcomParseResult {
  let records: GedcomRecord[];
  try {
    records = parseGedcom(gedcomText);
  } catch (err) {
    return {
      locations: [],
      warnings: [`Failed to parse GEDCOM file: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  const warnings: string[] = [];

  // Index records by ID for cross-reference resolution
  const byId = new Map<string, GedcomRecord>();
  for (const rec of records) {
    if (rec.id) byId.set(rec.id, rec);
  }

  // Index _LOC records: id -> { name, coords }
  const locRecords = new Map<string, { name: string; coords: GpsCoords | null }>();
  for (const rec of records) {
    if (rec.tag === "_LOC" && rec.id) {
      const name = childValue(rec.children, "NAME") ?? rec.value ?? rec.id;
      const mapNode = findChild(rec.children, "MAP");
      const coords = mapNode ? extractCoords(mapNode) : null;
      locRecords.set(rec.id, { name, coords });
    }
  }

  // Map from normalised place name -> LocationData (accumulator)
  const locationMap = new Map<string, LocationData>();

  function getOrCreateLocation(rawName: string, coords: GpsCoords | null): LocationData {
    const key = normalisePlaceName(rawName);
    let loc = locationMap.get(key);
    if (!loc) {
      loc = { name: rawName, coords, events: [] };
      locationMap.set(key, loc);
    } else if (!loc.coords && coords) {
      loc.coords = coords;
    }
    return loc;
  }

  /** Process a PLAC node value (possibly an @LOC_ID@ reference) and return place info */
  function resolvePlac(
    placValue: string,
    placNode: GedcomNode,
  ): { name: string; coords: GpsCoords | null } | null {
    // Check if it's a reference to a _LOC record
    const refMatch = placValue.match(/^@([^@]+)@$/);
    if (refMatch) {
      const locRef = `@${refMatch[1]}@`;
      const locRec = locRecords.get(locRef);
      if (locRec) return locRec;
      // Fall through – try to use the ref id as name
      return { name: refMatch[1], coords: null };
    }

    // Plain name – extract inline GPS if present
    if (!placValue) return null;
    const coords = coordsFromPlac(placNode);
    return { name: placValue, coords };
  }

  /** Process an event node and accumulate location data */
  function processEvent(
    eventNode: GedcomNode,
    eventType: string,
    persons: string[],
  ) {
    const placNode = findChild(eventNode.children, "PLAC");
    if (!placNode) return;

    const resolved = resolvePlac(placNode.line.value, placNode);
    if (!resolved) return;

    const date = childValue(eventNode.children, "DATE");

    const event: PlaceEvent = {
      type: EVENT_LABELS[eventType] ?? eventType,
      persons,
      date,
    };

    getOrCreateLocation(resolved.name, resolved.coords).events.push(event);
  }

  // Process INDI records
  for (const rec of records) {
    if (rec.tag !== "INDI") continue;

    const nameNode = findChild(rec.children, "NAME");
    const personName = nameNode ? formatName(nameNode.line.value) : (rec.id ?? "Unknown");

    for (const child of rec.children) {
      if (INDI_EVENT_TAGS.has(child.line.tag)) {
        processEvent(child, child.line.tag, [personName]);
      }
    }
  }

  // Process FAM records
  for (const rec of records) {
    if (rec.tag !== "FAM") continue;

    const husbId = childValue(rec.children, "HUSB");
    const wifeId = childValue(rec.children, "WIFE");

    function resolvePersonName(id: string | null): string | null {
      if (!id) return null;
      const indi = byId.get(id);
      if (!indi) return null;
      const nameNode = findChild(indi.children, "NAME");
      return nameNode ? formatName(nameNode.line.value) : id;
    }

    const persons = [resolvePersonName(husbId), resolvePersonName(wifeId)]
      .filter((n): n is string => n !== null);

    for (const child of rec.children) {
      if (FAM_EVENT_TAGS.has(child.line.tag)) {
        processEvent(child, child.line.tag, persons);
      }
    }
  }

  // Add standalone _LOC records that weren't referenced by any event
  // (they may still be useful – include them only if they have a name)
  for (const [_id, loc] of locRecords) {
    const key = normalisePlaceName(loc.name);
    if (!locationMap.has(key)) {
      locationMap.set(key, { name: loc.name, coords: loc.coords, events: [] });
    }
  }

  // Collect locations
  const locations = Array.from(locationMap.values());

  // Warn about locations without coords
  const missingCoords = locations.filter(l => !l.coords);
  if (missingCoords.length > 0) {
    warnings.push(
      `${missingCoords.length} location(s) have no GPS coordinates.`,
    );
  }

  // Warn about _LOC references that couldn't be resolved
  for (const rec of records) {
    if (rec.tag !== "INDI" && rec.tag !== "FAM") continue;
    for (const child of rec.children) {
      const placNode = findChild(child.children, "PLAC");
      if (!placNode) continue;
      const val = placNode.line.value;
      const refMatch = val.match(/^@([^@]+)@$/);
      if (refMatch) {
        const locRef = `@${refMatch[1]}@`;
        if (!locRecords.has(locRef)) {
          warnings.push(`Unresolved location reference "${locRef}" in record ${rec.id ?? "?"}.`);
        }
      }
    }
  }

  // Also check for PLAC tags on child nodes in _LOC (GEDKeeper sometimes nests them)
  for (const rec of records) {
    if (rec.tag !== "_LOC") continue;

    // GEDKeeper may also store sub-locations (_LOC children) – process them
    for (const child of rec.children) {
      if (child.line.tag === "_LOC") {
        const subName = childValue(child.children, "NAME") ?? child.line.value;
        if (!subName) continue;
        const mapNode = findChild(child.children, "MAP");
        const coords = mapNode ? extractCoords(mapNode) : null;
        const key = normalisePlaceName(subName);
        if (!locationMap.has(key)) {
          locationMap.set(key, { name: subName, coords, events: [] });
        }
      }
    }
  }

  // Also handle event PLAC tags that have inline _LOC children (rare but valid in GEDKeeper)
  for (const rec of records) {
    if (rec.tag !== "INDI" && rec.tag !== "FAM") continue;
    for (const eventNode of rec.children) {
      const placNode = findChild(eventNode.children, "PLAC");
      if (!placNode) continue;
      // Check for _LOC sub-record on PLAC
      const subLoc = findChild(placNode.children, "_LOC");
      if (subLoc) {
        const locId = subLoc.line.value;
        if (locId && !locRecords.has(locId)) {
          warnings.push(`Inline _LOC reference "${locId}" could not be resolved.`);
        }
      }
    }
  }

  // Re-collect after potential additions from sub-_LOC
  const finalLocations = Array.from(locationMap.values());

  return { locations: finalLocations, warnings };
}

/** Extract all unique PLAC values referenced across INDI and FAM records (for geocoding hints) */
export function getAllPlaceNames(records: GedcomRecord[]): string[] {
  const names = new Set<string>();
  for (const rec of records) {
    if (rec.tag !== "INDI" && rec.tag !== "FAM") continue;
    for (const eventNode of rec.children) {
      const placNode = findChild(eventNode.children, "PLAC");
      if (!placNode) continue;
      const val = placNode.line.value;
      if (val && !val.startsWith("@")) names.add(val);
    }
  }
  return Array.from(names);
}

/** Re-export findChildren for use in other modules */
export { findChildren };
