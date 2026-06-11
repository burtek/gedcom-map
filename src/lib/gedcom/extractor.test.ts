import { describe, expect, it } from "vitest";
import { extractLocations } from "./extractor";

describe("extractLocations coordinate recognition", () => {
  it("recognises prefixed LATI/LONG coordinates under PLAC MAP", () => {
    const gedcom = `0 HEAD
0 @I1@ INDI
1 NAME John /Doe/
1 BIRT
2 DATE 01 JAN 1900
2 PLAC London, England
3 MAP
4 LATI N51.5074
4 LONG W0.1278
0 TRLR`;

    const { locations } = extractLocations(gedcom);
    const london = locations.find(location => location.name === "London, England");

    expect(london?.coords).toEqual({ lat: 51.5074, lon: -0.1278 });
  });

  it("recognises plain numeric LATI/LONG coordinates from referenced _LOC", () => {
    const gedcom = `0 HEAD
0 @I1@ INDI
1 NAME John /Doe/
1 BIRT
2 DATE 01 JAN 1900
2 PLAC @L1@
0 @L1@ _LOC
1 NAME Muszyna,pow. nowosądecki,woj. małopolskie,PL
1 MAP
2 LATI 49.356590
2 LONG 20.897162
0 TRLR`;

    const { locations } = extractLocations(gedcom);
    const muszyna = locations.find(location =>
      location.name === "Muszyna,pow. nowosądecki,woj. małopolskie,PL");

    expect(muszyna?.coords).toEqual({ lat: 49.35659, lon: 20.897162 });
  });

  it("resolves GEDKeeper child _LOC reference under PLAC", () => {
    const gedcom = `0 HEAD
0 @I1@ INDI
1 NAME John /Doe/
1 BIRT
2 DATE 06 JUN 1771
2 PLAC Muszyna,pow. nowosądecki,woj. małopolskie,PL
3 _LOC @L137@
0 @L137@ _LOC
1 MAP
2 LATI 49.356590
2 LONG 20.897162
1 NAME Muszyna,pow. nowosądecki,woj. małopolskie,PL
0 TRLR`;

    const { locations } = extractLocations(gedcom);
    const muszyna = locations.find(location =>
      location.name === "Muszyna,pow. nowosądecki,woj. małopolskie,PL");

    expect(muszyna?.coords).toEqual({ lat: 49.35659, lon: 20.897162 });
    expect(muszyna?.events).toHaveLength(1);
  });
});
