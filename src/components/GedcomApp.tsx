"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import FileUpload from "@/components/FileUpload";
import WarningsList from "@/components/WarningsList";
import { extractLocations } from "@/lib/gedcom/extractor";
import { geocodePlaceNames } from "@/lib/geocoding/nominatim";
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
  | { type: "geocoding"; done: number; total: number }
  | { type: "done"; fileName: string; locations: LocationData[]; warnings: string[] };

export default function GedcomApp() {
  const [stage, setStage] = useState<Stage>({ type: "idle" });

  const handleFile = useCallback(async (text: string, fileName: string) => {
    setStage({ type: "parsing" });

    // Parse GEDCOM synchronously (file is already in memory)
    const { locations, warnings } = extractLocations(text);

    // Determine which locations still need geocoding
    const needsGeocode = locations.filter(l => !l.coords);

    if (needsGeocode.length === 0) {
      setStage({ type: "done", fileName, locations, warnings });
      return;
    }

    // Geocode missing locations via Nominatim (rate-limited)
    setStage({ type: "geocoding", done: 0, total: needsGeocode.length });

    const geocoded = await geocodePlaceNames(
      needsGeocode.map(l => l.name),
      (done, total) => setStage({ type: "geocoding", done, total }),
    );

    // Merge geocoded coordinates back into location objects
    const extraWarnings: string[] = [];
    for (const loc of needsGeocode) {
      const coords = geocoded.get(loc.name);
      if (coords) {
        loc.coords = coords;
      } else {
        extraWarnings.push(
          `Could not find coordinates for "${loc.name}" — it will not appear on the map.`,
        );
      }
    }

    setStage({
      type: "done",
      fileName,
      locations,
      warnings: [...warnings, ...extraWarnings],
    });
  }, []);

  const handleReset = useCallback(() => setStage({ type: "idle" }), []);

  const isProcessing = stage.type === "parsing" || stage.type === "geocoding";

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>GEDCOM Map</h1>
        <p className={styles.subtitle}>Visualise genealogy locations on an OpenStreetMap</p>
      </header>

      {stage.type !== "done" && (
        <div className={styles.uploadArea}>
          <FileUpload onFile={handleFile} disabled={isProcessing} />

          {stage.type === "parsing" && (
            <p className={styles.status}>⏳ Parsing GEDCOM file…</p>
          )}
          {stage.type === "geocoding" && (
            <p className={styles.status}>
              🌍 Geocoding locations… {stage.done}/{stage.total}
            </p>
          )}
        </div>
      )}

      {stage.type === "done" && (
        <div className={styles.resultArea}>
          <div className={styles.resultHeader}>
            <span className={styles.fileName}>📄 {stage.fileName}</span>
            <button className={styles.resetBtn} onClick={handleReset}>
              Load another file
            </button>
          </div>

          <div className={styles.stats}>
            <span>
              {stage.locations.filter(l => l.coords).length} location(s) on map
            </span>
            {stage.locations.filter(l => !l.coords).length > 0 && (
              <span className={styles.statWarn}>
                {" · "}
                {stage.locations.filter(l => !l.coords).length} without coordinates
              </span>
            )}
          </div>

          <MapView locations={stage.locations} />

          <WarningsList warnings={stage.warnings} />
        </div>
      )}
    </div>
  );
}
