import { SITES } from "../data/sites";
import type {
  PowerPoint,
  PowerSnapshot,
  SiteCatalog,
  SiteId,
  SolarSite,
  SystemStatus,
} from "../types";
import {
  darwinDate,
  fetchSolarCentreLatest,
  fetchSolarCentreRange,
  solarCentreApiHostname,
} from "./powerAdapter";
import { fetchJson } from "./request";

const OCI_API_BASE = (
  import.meta.env.VITE_PUBLIC_API_BASE ||
  "https://api.xn--fhq9f80kj05g.com/api/v1"
).replace(/\/$/, "");
const CACHE_KEY = "red-earth-lab:power:last-success:v2";
const SITE_IDS = new Set(SITES.map((site) => site.id));
const STATIC_BY_ID = new Map(SITES.map((site) => [site.id, site]));

export { darwinDate };

interface OciSite {
  site_id: number;
  site_name: string;
  capacity_kw: number;
  latitude: number;
  longitude: number;
  technology: string;
  array_structure: string;
  array_label: string;
  installed_year: number;
  tilt_deg: number;
  azimuth_deg: number;
}

interface OciSitesResponse {
  total_capacity_kw: number;
  sites: OciSite[];
}

interface OciLatestSite {
  site_id: number;
  observed_at: string | null;
  power_kw: number | null;
  data_status: string;
}

interface OciLatestResponse {
  checked_at: string;
  status: string;
  complete: boolean;
  latest_observed_at: string | null;
  sites: OciLatestSite[];
}

interface OciHistoryObservation {
  observed_at: string;
  site_id: number;
  power_kw: number | null;
}

interface OciHistoryResponse {
  observations: OciHistoryObservation[];
}

interface OciStatusResponse {
  status: SystemStatus["status"];
  checked_at: string;
  latest_observed_at: string | null;
  oldest_site_observed_at: string | null;
  freshness_seconds: number | null;
  reporting_site_count: number;
  expected_site_count: number;
  all_sites_reporting: boolean;
  latest_consistent: boolean;
}

function isSiteId(value: number): value is SiteId {
  return SITE_IDS.has(value as SiteId);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function readCache(): PowerSnapshot | null {
  try {
    const value = window.localStorage.getItem(CACHE_KEY);
    return value ? (JSON.parse(value) as PowerSnapshot) : null;
  } catch {
    return null;
  }
}

function saveCache(snapshot: PowerSnapshot): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Device-local caching is optional; fresh public data remains usable.
  }
}

function normalizeSite(site: OciSite): SolarSite | null {
  if (!isSiteId(site.site_id)) return null;
  const fallback = STATIC_BY_ID.get(site.site_id)!;
  return {
    id: site.site_id,
    name: site.site_name,
    capacityKw: Number(site.capacity_kw),
    latitude: Number(site.latitude),
    longitude: Number(site.longitude),
    technology: site.technology,
    structure: site.array_structure,
    arrayLabel: site.array_label,
    installedYear: Number(site.installed_year),
    tiltDeg: Number(site.tilt_deg),
    azimuthDeg: Number(site.azimuth_deg),
    color: fallback.color,
  };
}

async function fetchOciLatest(): Promise<PowerSnapshot> {
  const payload = await fetchJson<OciLatestResponse>(`${OCI_API_BASE}/power/latest`, {
    timeoutMs: 12_000,
    retries: 1,
  });
  const points: PowerPoint[] = payload.sites.flatMap((site) =>
    isSiteId(site.site_id) && site.observed_at
      ? [{ observedAt: site.observed_at, siteId: site.site_id, powerKw: site.power_kw }]
      : [],
  );
  if (points.length === 0) throw new Error("OCI API returned no latest observations");
  return {
    points,
    fetchedAt: new Date().toISOString(),
    fromCache: false,
    partialFailures: payload.complete ? [] : ["OCI API 报告部分站点数据不完整"],
    source: "oci-api",
  };
}

async function fetchOciHistory(startDate: string, endDate: string): Promise<PowerSnapshot> {
  const params = new URLSearchParams({
    start: `${startDate}T00:00:00+09:30`,
    end: `${addDays(endDate, 1)}T00:00:00+09:30`,
  });
  const payload = await fetchJson<OciHistoryResponse>(
    `${OCI_API_BASE}/power/history?${params.toString()}`,
    { timeoutMs: 25_000, retries: 1 },
  );
  const points = payload.observations.flatMap((observation) =>
    isSiteId(observation.site_id)
      ? [{
          observedAt: observation.observed_at,
          siteId: observation.site_id,
          powerKw: observation.power_kw,
        }]
      : [],
  );
  return {
    points,
    fetchedAt: new Date().toISOString(),
    fromCache: false,
    partialFailures: [],
    source: "oci-api",
  };
}

export async function fetchLatestPower(): Promise<PowerSnapshot> {
  try {
    const snapshot = await fetchOciLatest();
    saveCache(snapshot);
    return snapshot;
  } catch {
    try {
      const fallback = await fetchSolarCentreLatest();
      const snapshot = {
        ...fallback,
        partialFailures: [
          "OCI 主接口暂时不可用，已切换到 Solar Centre 公开源",
          ...fallback.partialFailures,
        ],
      };
      saveCache(snapshot);
      return snapshot;
    } catch {
      const cached = readCache();
      if (cached) return { ...cached, fromCache: true };
      throw new Error("All public power sources are temporarily unavailable");
    }
  }
}

export async function fetchPowerRange(
  startDate: string,
  endDate: string,
): Promise<PowerSnapshot> {
  try {
    return await fetchOciHistory(startDate, endDate);
  } catch {
    const fallback = await fetchSolarCentreRange(startDate, endDate);
    return {
      ...fallback,
      partialFailures: [
        "OCI 历史接口暂时不可用，已切换到 Solar Centre 公开源",
        ...fallback.partialFailures,
      ],
    };
  }
}

export async function fetchSiteCatalog(): Promise<SiteCatalog> {
  try {
    const payload = await fetchJson<OciSitesResponse>(`${OCI_API_BASE}/sites`, {
      timeoutMs: 10_000,
      retries: 1,
    });
    const sites = payload.sites
      .map(normalizeSite)
      .filter((site): site is SolarSite => site !== null);
    if (sites.length !== SITES.length) throw new Error("OCI API site catalog is incomplete");
    return {
      sites,
      totalCapacityKw: Number(payload.total_capacity_kw),
      fetchedAt: new Date().toISOString(),
      source: "oci-api",
    };
  } catch {
    return {
      sites: SITES,
      totalCapacityKw: SITES.reduce((total, site) => total + site.capacityKw, 0),
      fetchedAt: new Date().toISOString(),
      source: "static-fallback",
    };
  }
}

export async function fetchSystemStatus(): Promise<SystemStatus> {
  const payload = await fetchJson<OciStatusResponse>(`${OCI_API_BASE}/status`, {
    timeoutMs: 10_000,
    retries: 1,
  });
  return {
    status: payload.status,
    checkedAt: payload.checked_at,
    latestObservedAt: payload.latest_observed_at,
    oldestSiteObservedAt: payload.oldest_site_observed_at,
    freshnessSeconds: payload.freshness_seconds,
    reportingSiteCount: payload.reporting_site_count,
    expectedSiteCount: payload.expected_site_count,
    allSitesReporting: payload.all_sites_reporting,
    latestConsistent: payload.latest_consistent,
  };
}

export function powerApiHostnames(): string[] {
  return [new URL(OCI_API_BASE).hostname, solarCentreApiHostname()];
}
