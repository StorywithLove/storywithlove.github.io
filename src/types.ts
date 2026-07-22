export type SiteId = 5 | 8 | 10 | 11 | 3051;

export interface SolarSite {
  id: SiteId;
  name: string;
  capacityKw: number;
  latitude: number;
  longitude: number;
  technology: string;
  structure: string;
  arrayLabel: string;
  installedYear: number;
  tiltDeg: number;
  azimuthDeg: number;
  color: string;
}

export interface PowerPoint {
  observedAt: string;
  siteId: SiteId;
  powerKw: number | null;
}

export interface PowerSnapshot {
  points: PowerPoint[];
  fetchedAt: string;
  fromCache: boolean;
  partialFailures: string[];
  source: "oci-api" | "solar-centre";
}

export interface SiteCatalog {
  sites: SolarSite[];
  totalCapacityKw: number;
  fetchedAt: string;
  source: "oci-api" | "static-fallback";
}

export interface SystemStatus {
  status: "fresh" | "delayed" | "stale" | "partial" | "degraded" | "unavailable";
  checkedAt: string;
  latestObservedAt: string | null;
  oldestSiteObservedAt: string | null;
  freshnessSeconds: number | null;
  reportingSiteCount: number;
  expectedSiteCount: number;
  allSitesReporting: boolean;
  latestConsistent: boolean;
}

export interface WeatherSnapshot {
  observedAt: string;
  fetchedAt: string;
  temperatureC: number | null;
  humidityPercent: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  shortwaveRadiationWm2: number | null;
  weatherCode: number | null;
  isDay: boolean | null;
  sunrise: string | null;
  sunset: string | null;
  fromCache: boolean;
}

export type LoadState = "idle" | "loading" | "success" | "error";
