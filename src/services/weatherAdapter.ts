import type { WeatherSnapshot } from "../types";
import { fetchJson } from "./request";

const WEATHER_ENDPOINT =
  import.meta.env.VITE_PUBLIC_WEATHER_API_BASE ||
  "https://api.open-meteo.com/v1/forecast";
const CACHE_KEY = "red-earth-lab:open-meteo:last-success:v1";

interface OpenMeteoResponse {
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    shortwave_radiation?: number;
    weather_code?: number;
    is_day?: number;
  };
  daily?: {
    sunrise?: string[];
    sunset?: string[];
  };
}

function cachedWeather(): WeatherSnapshot | null {
  try {
    const value = window.localStorage.getItem(CACHE_KEY);
    return value ? (JSON.parse(value) as WeatherSnapshot) : null;
  } catch {
    return null;
  }
}

export async function fetchYularaWeather(): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: "-25.2325",
    longitude: "130.982",
    current:
      "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,shortwave_radiation,weather_code,is_day",
    daily: "sunrise,sunset",
    timezone: "Australia/Darwin",
    forecast_days: "1",
  });

  try {
    const response = await fetchJson<OpenMeteoResponse>(
      `${WEATHER_ENDPOINT}?${params.toString()}`,
      { timeoutMs: 10_000, retries: 1 },
    );
    if (!response.current?.time) throw new Error("Weather response is empty");
    const snapshot: WeatherSnapshot = {
      observedAt: `${response.current.time}:00+09:30`,
      fetchedAt: new Date().toISOString(),
      temperatureC: response.current.temperature_2m ?? null,
      humidityPercent: response.current.relative_humidity_2m ?? null,
      windSpeedKmh: response.current.wind_speed_10m ?? null,
      windDirectionDeg: response.current.wind_direction_10m ?? null,
      shortwaveRadiationWm2: response.current.shortwave_radiation ?? null,
      weatherCode: response.current.weather_code ?? null,
      isDay:
        response.current.is_day === undefined ? null : response.current.is_day === 1,
      sunrise: response.daily?.sunrise?.[0] ?? null,
      sunset: response.daily?.sunset?.[0] ?? null,
      fromCache: false,
    };
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
    } catch {
      // Public model data remains usable without device cache.
    }
    return snapshot;
  } catch (error) {
    const cached = cachedWeather();
    if (cached) return { ...cached, fromCache: true };
    throw error;
  }
}
