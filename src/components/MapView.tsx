"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import type { LocationData } from "@/lib/gedcom/types";
import styles from "./MapView.module.css";

// Fix Leaflet default icon paths broken by webpack/Next.js bundling
function fixLeafletIcons() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x.src,
    iconUrl: markerIcon.src,
    shadowUrl: markerShadow.src,
  });
}

fixLeafletIcons();

interface MapViewProps {
  locations: LocationData[];
}

/** Inner component that auto-fits the map to all markers */
function FitBounds({ locations }: { locations: LocationData[] }) {
  const map = useMap();

  useEffect(() => {
    const coords = locations.flatMap(l => (l.coords ? [l.coords] : []));
    if (coords.length === 0) return;

    if (coords.length === 1) {
      map.setView([coords[0].lat, coords[0].lon], 10);
    } else {
      const bounds = L.latLngBounds(coords.map(c => [c.lat, c.lon] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [map, locations]);

  return null;
}

/** Format a popup for a location */
function renderPopupContent(location: LocationData): string {
  const lines: string[] = [`<strong>${escapeHtml(location.name)}</strong>`];

  if (location.events.length === 0) {
    lines.push("<em>No events recorded</em>");
  } else {
    lines.push("<ul style='margin:0.4rem 0 0;padding:0 0 0 1rem'>");
    for (const event of location.events) {
      const who = event.persons.length > 0 ? event.persons.join(" & ") : "Unknown";
      const when = event.date ? `, ${escapeHtml(event.date)}` : "";
      lines.push(`<li>${escapeHtml(event.type)}: ${escapeHtml(who)}${when}</li>`);
    }
    lines.push("</ul>");
  }

  return lines.join("");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default function MapView({ locations }: MapViewProps) {
  const locationsWithCoords = locations.filter(l => l.coords);

  return (
    <div className={styles.wrapper}>
      <MapContainer
        center={[20, 0]}
        zoom={2}
        className={styles.map}
        scrollWheelZoom
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />
        <FitBounds locations={locationsWithCoords} />
        {locationsWithCoords.map(location => {
          const { lat, lon } = location.coords ?? { lat: 0, lon: 0 };
          const markerKey = `${location.name}:${lat}:${lon}`;
          return (
            <Marker key={markerKey} position={[lat, lon]}>
              <Popup maxWidth={320}>
                <div
                  dangerouslySetInnerHTML={{ __html: renderPopupContent(location) }}
                />
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
      {locationsWithCoords.length === 0 && (
        <div className={styles.emptyOverlay}>
          <p>No locations with coordinates to display.</p>
        </div>
      )}
    </div>
  );
}
