"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import FileUpload from "@/components/FileUpload";
import WarningsList from "@/components/WarningsList";
import { extractLocations } from "@/lib/gedcom/extractor";
import { geocodePlaceNames, type GeocodeLogger } from "@/lib/geocoding/nominatim";
import type { LocationData } from "@/lib/gedcom/types";
import styles from "./GedcomApp.module.css";

// Load Leaflet-based map only on the client (no SSR)
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <div className={styles.mapPlaceholder}>Loading map…</div>,
});

type Stage =
  | { type: "idle" }
  | { type: "parsing" }
  | { type: "review"; fileName: string; locations: LocationData[]; warnings: string[] }
  | { type: "geocoding"; fileName: string; locations: LocationData[]; warnings: string[]; done: number; total: number }
  | { type: "done"; fileName: string; locations: LocationData[]; warnings: string[] };

function normalisePlaceName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

export default function GedcomApp() {
  const [stage, setStage] = useState<Stage>({ type: "idle" });

  const geocodeLoggerEnabled = useCallback(
    () => new URLSearchParams(window.location.search).get("logger") === "true",
    [],
  );

  const createGeocodeLogger = useCallback(
    (enabled: boolean): GeocodeLogger => (message, details) => {
      if (!enabled) return;
      if (details) {
        // eslint-disable-next-line no-console
        console.debug(`[geocoding] ${message}`, details);
        return;
      }
      // eslint-disable-next-line no-console
      console.debug(`[geocoding] ${message}`);
    },
    [],
  );

  const handleFile = useCallback(async (text: string, fileName: string) => {
    setStage({ type: "parsing" });
    const loggerEnabled = geocodeLoggerEnabled();
    const logGeocoding = createGeocodeLogger(loggerEnabled);

    // Parse GEDCOM synchronously (file is already in memory)
    const { locations, warnings } = extractLocations(text);
    logGeocoding("locations-extracted", {
      total: locations.length,
      withCoords: locations.filter(l => l.coords).length,
      withoutCoords: locations.filter(l => !l.coords).length,
    });

    const missingCount = locations.filter(l => !l.coords).length;
    if (missingCount === 0) {
      setStage({ type: "done", fileName, locations, warnings });
      return;
    }

    setStage({ type: "review", fileName, locations, warnings });
  }, [createGeocodeLogger, geocodeLoggerEnabled]);

  const handleSkipGeocoding = useCallback(() => {
    if (stage.type !== "review") return;
    setStage({
      type: "done",
      fileName: stage.fileName,
      locations: stage.locations,
      warnings: stage.warnings,
    });
  }, [stage]);

  const handleStartGeocoding = useCallback(async () => {
    if (stage.type !== "review") return;

    const loggerEnabled = geocodeLoggerEnabled();
    const logGeocoding = createGeocodeLogger(loggerEnabled);
    const workingLocations = stage.locations.map(location => ({
      ...location,
      coords: location.coords ? { ...location.coords } : null,
    }));

    const needsGeocode = workingLocations.filter(l => !l.coords);
    const geocodeTargetByKey = new Map<string, string>();
    const geocodeKeyByTarget = new Map<string, string>();
    for (const loc of needsGeocode) {
      const key = normalisePlaceName(loc.name);
      if (!geocodeTargetByKey.has(key)) {
        geocodeTargetByKey.set(key, loc.name);
        geocodeKeyByTarget.set(loc.name, key);
      }
    }
    const geocodeTargets = Array.from(geocodeTargetByKey.values());
    logGeocoding("geocode-targets-prepared", {
      missingLocations: needsGeocode.length,
      uniqueTargets: geocodeTargets.length,
      deduplicated: needsGeocode.length - geocodeTargets.length,
    });

    if (geocodeTargets.length === 0) {
      setStage({
        type: "done",
        fileName: stage.fileName,
        locations: workingLocations,
        warnings: stage.warnings,
      });
      return;
    }

    setStage({
      type: "geocoding",
      fileName: stage.fileName,
      locations: workingLocations,
      warnings: stage.warnings,
      done: 0,
      total: geocodeTargets.length,
    });

    await geocodePlaceNames(
      geocodeTargets,
      (done, total) =>
        setStage(prev => (
          prev.type === "geocoding"
            ? { ...prev, done, total }
            : prev
        )),
      undefined,
      loggerEnabled ? logGeocoding : undefined,
      (targetName, coords) => {
        if (!coords) return;
        const key = geocodeKeyByTarget.get(targetName);
        if (!key) return;
        for (const location of workingLocations) {
          if (!location.coords && normalisePlaceName(location.name) === key) {
            location.coords = coords;
          }
        }
        setStage(prev => (
          prev.type === "geocoding"
            ? { ...prev, locations: [...workingLocations] }
            : prev
        ));
      },
    );

    const extraWarnings: string[] = [];
    for (const loc of needsGeocode) {
      if (!loc.coords) {
        extraWarnings.push(
          `Could not find coordinates for "${loc.name}" — it will not appear on the map.`,
        );
      }
    }

    setStage({
      type: "done",
      fileName: stage.fileName,
      locations: workingLocations,
      warnings: [...stage.warnings, ...extraWarnings],
    });
  }, [createGeocodeLogger, geocodeLoggerEnabled, stage]);

  const handleReset = useCallback(() => setStage({ type: "idle" }), []);

  const isProcessing = stage.type === "parsing" || stage.type === "geocoding";
  const resultStage = (
    stage.type === "review" ||
    stage.type === "geocoding" ||
    stage.type === "done"
  )
    ? stage
    : null;
  const withCoords = resultStage?.locations.filter(l => l.coords).length ?? 0;
  const withoutCoords = resultStage?.locations.filter(l => !l.coords).length ?? 0;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>GEDCOM Map</h1>
        <p className={styles.subtitle}>Visualise genealogy locations on an OpenStreetMap</p>
      </header>

      {resultStage === null && (
        <div className={styles.uploadArea}>
          <FileUpload onFile={handleFile} disabled={isProcessing} />

          {stage.type === "parsing" && (
            <p className={styles.status}>⏳ Parsing GEDCOM file…</p>
          )}
        </div>
      )}

      {resultStage !== null && (
        <div className={styles.resultArea}>
          <div className={styles.resultHeader}>
            <span className={styles.fileName}>📄 {resultStage.fileName}</span>
            <button className={styles.resetBtn} onClick={handleReset}>
              Load another file
            </button>
          </div>

          <div className={styles.stats}>
            <span>{withCoords} location(s) on map</span>
            {withoutCoords > 0 && (
              <span className={styles.statWarn}>
                {" · "}
                {withoutCoords} without coordinates
              </span>
            )}
          </div>

          {stage.type === "review" && (
            <section className={styles.geocodePrompt}>
              <p>
                Found {withCoords} location(s) with coordinates and {withoutCoords} without coordinates.
              </p>
              <p>Do you want to geocode the missing locations via Nominatim?</p>
              <div className={styles.geocodeActions}>
                <button className={styles.primaryBtn} onClick={handleStartGeocoding}>
                  Start geocoding
                </button>
                <button className={styles.resetBtn} onClick={handleSkipGeocoding}>
                  Skip geocoding
                </button>
              </div>
            </section>
          )}

          {stage.type === "geocoding" && (
            <p className={styles.status}>
              🌍 Geocoding missing locations… {stage.done}/{stage.total}
            </p>
          )}

          <MapView locations={resultStage.locations} />

          <WarningsList warnings={resultStage.warnings} />
        </div>
      )}
    </div>
  );
}
