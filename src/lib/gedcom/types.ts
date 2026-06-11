/** A single parsed GEDCOM line */
export interface GedcomLine {
  level: number;
  xref: string | null;
  tag: string;
  value: string;
}

/** A node in the GEDCOM record tree */
export interface GedcomNode {
  line: GedcomLine;
  children: GedcomNode[];
}

/** A top-level GEDCOM record (level-0 node) */
export interface GedcomRecord {
  id: string | null;
  tag: string;
  value: string;
  children: GedcomNode[];
}

/** Coordinates extracted from a MAP record */
export interface GpsCoords {
  lat: number;
  lon: number;
}

/** A single event tied to a place */
export interface PlaceEvent {
  /** Event type label, e.g. "Birth", "Death", "Marriage" */
  type: string;
  /** Display name(s) of the person(s) involved */
  persons: string[];
  /** Raw date string from GEDCOM DATE tag */
  date: string | null;
}

/** A geographical location with all associated events */
export interface LocationData {
  /** Canonical place name as written in the GEDCOM file */
  name: string;
  /** GPS coordinates – present when the file contained MAP/LATI/LONG data */
  coords: GpsCoords | null;
  /** All events that occurred at this location */
  events: PlaceEvent[];
}

/** Result of processing a GEDCOM file */
export interface GedcomParseResult {
  locations: LocationData[];
  /** Warnings produced during extraction (e.g. unparseable date, missing coords) */
  warnings: string[];
}
