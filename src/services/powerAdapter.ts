import { SITES } from "../data/sites";
import type { PowerPoint, PowerSnapshot, SiteId } from "../types";
import { fetchJson } from "./request";

const API_BASE =
  import.meta.env.VITE_PUBLIC_SOLAR_CENTRE_API_BASE ||
  "https://solarcentre.spinifexvalley.com.au/power/average";
const SOURCE_MAP = Object.fromEntries(SITES.map((site) => [String(site.id), [193]]));
const DARWIN_TZ = "Australia/Darwin";

interface SolarCentrePayload {
  header?: Array<string | Record<string, number>>;
  measures?: Array<Array<string | number | null>>;
  message?: string;
}

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: DARWIN_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function darwinDate(date = new Date()): string {
  return dateFormatter.format(date);
}

function parseDarwinTimestamp(value: string): string {
  const [datePart, timePart] = value.split(" ");
  if (!datePart || !timePart) throw new Error("Invalid source timestamp");
  return new Date(`${datePart}T${timePart}+09:30`).toISOString();
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return formatDate(value);
}

function splitRange(startDate: string, endDate: string): Array<[string, string]> {
  const chunks: Array<[string, string]> = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    const chunkEnd = addDays(cursor, 2) < endDate ? addDays(cursor, 2) : endDate;
    chunks.push([cursor, chunkEnd]);
    cursor = addDays(chunkEnd, 1);
  }
  return chunks;
}

function makeUrl(startDate: string, endDate: string): string {
  const params = new URLSearchParams({
    interval: "",
    start_date: startDate,
    end_date: endDate,
    sources: JSON.stringify(SOURCE_MAP),
  });
  return `${API_BASE}?${params.toString()}`;
}

function normalize(payload: SolarCentrePayload): PowerPoint[] {
  if (payload.header?.length === 0 && payload.measures?.length === 0) return [];
  if (!Array.isArray(payload.header) || payload.header.length < 2) {
    throw new Error("Solar Centre returned an invalid header");
  }
  if (!Array.isArray(payload.measures)) {
    throw new Error("Solar Centre returned invalid measures");
  }

  const siteIds = payload.header.slice(1).map((item) => {
    if (typeof item !== "object" || item === null) {
      throw new Error("Solar Centre returned an invalid source column");
    }
    return Number(Object.keys(item)[0]) as SiteId;
  });

  const points: PowerPoint[] = [];
  for (const measure of payload.measures) {
    if (!Array.isArray(measure) || measure.length !== payload.header.length) continue;
    const observedAt = parseDarwinTimestamp(String(measure[0]));
    siteIds.forEach((siteId, index) => {
      const raw = measure[index + 1];
      points.push({
        observedAt,
        siteId,
        powerKw: raw === null || raw === undefined ? null : Number(raw),
      });
    });
  }
  return points;
}

function deduplicate(points: PowerPoint[]): PowerPoint[] {
  const records = new Map<string, PowerPoint>();
  for (const point of points) {
    records.set(`${point.observedAt}:${point.siteId}`, point);
  }
  return [...records.values()].sort((a, b) =>
    a.observedAt.localeCompare(b.observedAt) || a.siteId - b.siteId,
  );
}

async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = new Array(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { status: "fulfilled", value: await mapper(values[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export async function fetchSolarCentreRange(
  startDate: string,
  endDate: string,
): Promise<PowerSnapshot> {
  const chunks = splitRange(startDate, endDate);
  const results = await mapConcurrent(chunks, 3, async ([start, end]) => {
    const payload = await fetchJson<SolarCentrePayload>(makeUrl(start, end), {
      timeoutMs: 15_000,
      retries: 1,
    });
    return { label: `${start}—${end}`, points: normalize(payload) };
  });

  const points: PowerPoint[] = [];
  const partialFailures: string[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") points.push(...result.value.points);
    else partialFailures.push("部分日期分段暂时无法读取");
  }

  if (points.length === 0) {
    throw new Error("Solar Centre public data is temporarily unavailable");
  }

  const snapshot: PowerSnapshot = {
    points: deduplicate(points),
    fetchedAt: new Date().toISOString(),
    fromCache: false,
    partialFailures,
    source: "solar-centre",
  };
  return snapshot;
}

export async function fetchSolarCentreLatest(): Promise<PowerSnapshot> {
  const today = darwinDate();
  try {
    const snapshot = await fetchSolarCentreRange(today, today);
    if (snapshot.points.length > 0) return snapshot;
  } catch {
    // A previous Darwin day is the only real-data fallback around midnight.
  }
  return fetchSolarCentreRange(addDays(today, -1), today);
}

export function solarCentreApiHostname(): string {
  return new URL(API_BASE).hostname;
}
