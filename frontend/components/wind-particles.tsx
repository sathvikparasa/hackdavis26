import { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';

const PARTICLE_COUNT = 128;
const TRAIL_POINTS = 28;
const REFRESH_MS = 10 * 60 * 1000;
const GRID_ROWS = 4;
const GRID_COLS = 4;
const METERS_PER_DEGREE_LATITUDE = 111_320;
const WIND_VISUAL_SPEEDUP = 380;

export type WindData = { speed: number; deg: number };

export type WindLocation = {
  latitude: number;
  longitude: number;
};

export type WindViewport = WindLocation & {
  latitudeDelta: number;
  longitudeDelta: number;
};

export type WindBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export type WindGridPoint = WindLocation & WindData & {
  x: number;
  y: number;
  readingCount: number;
};

export type WindSnapshot = WindData & {
  bounds: WindBounds;
  grid: WindGridPoint[];
  readingCount: number;
  updatedAt: string;
  viewport: WindViewport;
};

type WindReading = WindData & { weight: number };
type GridLocation = WindLocation & { x: number; y: number; key: string };
type Particle = {
  latitude: number;
  longitude: number;
  age: number;
  seed: number;
  trail: WindLocation[];
};

const DEFAULT_WIND_VIEWPORT: WindViewport = {
  latitude: 38.6785,
  longitude: -121.9018,
  latitudeDelta: 0.45,
  longitudeDelta: 0.55,
};

const YOLO_WIND_BOUNDS: WindBounds = {
  north: 39.1,
  south: 38.25,
  east: -121.4,
  west: -122.45,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeWind(speed: unknown, deg: unknown): WindData | null {
  if (typeof speed !== 'number' || typeof deg !== 'number') return null;
  if (!Number.isFinite(speed) || !Number.isFinite(deg)) return null;

  return {
    speed: Math.max(0, speed),
    deg: ((deg % 360) + 360) % 360,
  };
}

function viewportKey(viewport: WindViewport): string {
  return [
    viewport.latitude.toFixed(3),
    viewport.longitude.toFixed(3),
    viewport.latitudeDelta.toFixed(3),
    viewport.longitudeDelta.toFixed(3),
  ].join(',');
}

function boundsFromViewport(viewport: WindViewport): WindBounds {
  const latPad = viewport.latitudeDelta * 0.18;
  const lonPad = viewport.longitudeDelta * 0.18;
  const north = clamp(viewport.latitude + viewport.latitudeDelta / 2 + latPad, YOLO_WIND_BOUNDS.south, YOLO_WIND_BOUNDS.north);
  const south = clamp(viewport.latitude - viewport.latitudeDelta / 2 - latPad, YOLO_WIND_BOUNDS.south, YOLO_WIND_BOUNDS.north);
  const east = clamp(viewport.longitude + viewport.longitudeDelta / 2 + lonPad, YOLO_WIND_BOUNDS.west, YOLO_WIND_BOUNDS.east);
  const west = clamp(viewport.longitude - viewport.longitudeDelta / 2 - lonPad, YOLO_WIND_BOUNDS.west, YOLO_WIND_BOUNDS.east);

  return {
    north: Math.max(north, south),
    south: Math.min(north, south),
    east: Math.max(east, west),
    west: Math.min(east, west),
  };
}

function buildGrid(bounds: WindBounds): GridLocation[] {
  const points: GridLocation[] = [];
  const latSpan = Math.max(0.01, bounds.north - bounds.south);
  const lonSpan = Math.max(0.01, bounds.east - bounds.west);

  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      const y = row / (GRID_ROWS - 1);
      const x = col / (GRID_COLS - 1);
      const latitude = bounds.north - latSpan * y;
      const longitude = bounds.west + lonSpan * x;
      points.push({
        latitude,
        longitude,
        x,
        y,
        key: `${latitude.toFixed(3)},${longitude.toFixed(3)}`,
      });
    }
  }

  return points;
}

function nearestHourlyIndex(times: unknown): number {
  if (!Array.isArray(times) || times.length === 0) return 0;

  const now = Date.now();
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  times.forEach((time, index) => {
    if (typeof time !== 'string') return;
    const stamp = new Date(time).getTime();
    if (!Number.isFinite(stamp)) return;
    const distance = Math.abs(stamp - now);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

function hourlyValue(values: unknown, index: number): unknown {
  return Array.isArray(values) ? values[index] : undefined;
}

async function fetchOpenMeteoWind(location: WindLocation): Promise<WindReading | null> {
  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timezone=auto`
    );
    if (!r.ok) return null;
    const d = await r.json();
    const wind = normalizeWind(d?.current?.wind_speed_10m, d?.current?.wind_direction_10m);
    return wind ? { ...wind, weight: 1.8 } : null;
  } catch {
    return null;
  }
}

async function fetchEcmwfWind(location: WindLocation): Promise<WindReading[]> {
  try {
    const hourly = [
      'temperature_2m',
      'wind_speed_10m',
      'wind_speed_100m',
      'wind_direction_10m',
      'wind_direction_100m',
      'wind_gusts_10m',
    ].join(',');
    const r = await fetch(
      `https://api.open-meteo.com/v1/ecmwf?latitude=${location.latitude}&longitude=${location.longitude}&hourly=${hourly}&wind_speed_unit=ms&forecast_hours=6&timezone=auto`
    );
    if (!r.ok) return [];

    const d = await r.json();
    const index = nearestHourlyIndex(d?.hourly?.time);
    const wind10m = normalizeWind(
      hourlyValue(d?.hourly?.wind_speed_10m, index),
      hourlyValue(d?.hourly?.wind_direction_10m, index)
    );
    const wind100m = normalizeWind(
      hourlyValue(d?.hourly?.wind_speed_100m, index),
      hourlyValue(d?.hourly?.wind_direction_100m, index)
    );
    const gust10m = normalizeWind(
      hourlyValue(d?.hourly?.wind_gusts_10m, index),
      hourlyValue(d?.hourly?.wind_direction_10m, index)
    );

    return [
      wind10m ? { ...wind10m, weight: 1.15 } : null,
      wind100m ? { ...wind100m, weight: 0.35 } : null,
      gust10m ? { ...gust10m, weight: 0.3 } : null,
    ].filter((reading): reading is WindReading => reading !== null);
  } catch {
    return [];
  }
}

function vectorAverage(readings: WindReading[]): WindData | null {
  if (readings.length === 0) return null;

  let u = 0;
  let v = 0;
  let totalWeight = 0;
  for (const { speed, deg, weight } of readings) {
    const rad = (deg * Math.PI) / 180;
    u += speed * Math.sin(rad) * weight;
    v += speed * Math.cos(rad) * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return null;

  u /= totalWeight;
  v /= totalWeight;

  return {
    speed: Math.sqrt(u * u + v * v),
    deg: ((Math.atan2(u, v) * 180) / Math.PI + 360) % 360,
  };
}

async function fetchGridPointWind(point: GridLocation): Promise<WindGridPoint | null> {
  const results = await Promise.allSettled([
    fetchOpenMeteoWind(point),
    fetchEcmwfWind(point),
  ]);
  const readings = results.flatMap((result) => {
    if (result.status !== 'fulfilled' || result.value === null) return [];
    return Array.isArray(result.value) ? result.value : [result.value];
  });
  const wind = vectorAverage(readings);

  return wind ? { ...point, ...wind, readingCount: readings.length } : null;
}

export function useWindData(viewport: WindViewport = DEFAULT_WIND_VIEWPORT): WindSnapshot | null {
  const [wind, setWind] = useState<WindSnapshot | null>(null);
  const key = viewportKey(viewport);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    const [latitude, longitude, latitudeDelta, longitudeDelta] = key.split(',').map(Number);
    const roundedViewport = { latitude, longitude, latitudeDelta, longitudeDelta };
    const bounds = boundsFromViewport(roundedViewport);
    const gridLocations = buildGrid(bounds);

    async function load() {
      const grid = (await Promise.all(gridLocations.map(fetchGridPointWind)))
        .filter((point): point is WindGridPoint => point !== null);
      const avg = vectorAverage(grid.map((point) => ({ speed: point.speed, deg: point.deg, weight: point.readingCount || 1 })));

      if (avg && grid.length > 0 && !cancelled) {
        setWind({
          ...avg,
          bounds,
          grid,
          readingCount: grid.reduce((sum, point) => sum + point.readingCount, 0),
          updatedAt: new Date().toISOString(),
          viewport: roundedViewport,
        });
      }
    }

    load();
    interval = setInterval(load, REFRESH_MS);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [key]);

  return wind;
}

function windColor(speed: number): string {
  if (speed < 2) return '#9ad4f5';
  if (speed < 5) return '#5ec4a8';
  if (speed < 10) return '#d4e84a';
  if (speed < 15) return '#f5c21a';
  return '#e8604c';
}

function viewportBounds(viewport: WindViewport): WindBounds {
  return {
    north: viewport.latitude + viewport.latitudeDelta / 2,
    south: viewport.latitude - viewport.latitudeDelta / 2,
    east: viewport.longitude + viewport.longitudeDelta / 2,
    west: viewport.longitude - viewport.longitudeDelta / 2,
  };
}

function randomParticle(viewport: WindViewport): Particle {
  const bounds = viewportBounds(viewport);
  const latitude = bounds.south + Math.random() * (bounds.north - bounds.south);
  const longitude = bounds.west + Math.random() * (bounds.east - bounds.west);

  return {
    latitude,
    longitude,
    age: Math.random() * 220,
    seed: 0.82 + Math.random() * 0.45,
    trail: Array.from({ length: TRAIL_POINTS }, () => ({ latitude, longitude })),
  };
}

function sampleWind(wind: WindSnapshot | WindData, location: WindLocation): WindData {
  if (!('grid' in wind) || wind.grid.length === 0) {
    return wind;
  }

  const latSpan = Math.max(0.01, wind.bounds.north - wind.bounds.south);
  const lonSpan = Math.max(0.01, wind.bounds.east - wind.bounds.west);
  const nx = clamp((location.longitude - wind.bounds.west) / lonSpan, 0, 1);
  const ny = clamp((wind.bounds.north - location.latitude) / latSpan, 0, 1);
  const nearby = wind.grid
    .map((point) => {
      const distanceSq = (point.x - nx) ** 2 + (point.y - ny) ** 2;
      return {
        speed: point.speed,
        deg: point.deg,
        weight: 1 / Math.max(0.0025, distanceSq),
      };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4);

  return vectorAverage(nearby) ?? wind;
}

function isInViewport(location: WindLocation, viewport: WindViewport): boolean {
  const bounds = viewportBounds(viewport);
  return (
    location.latitude >= bounds.south &&
    location.latitude <= bounds.north &&
    location.longitude >= bounds.west &&
    location.longitude <= bounds.east
  );
}

function projectLocation(location: WindLocation, viewport: WindViewport, width: number, height: number) {
  const bounds = viewportBounds(viewport);
  const x = ((location.longitude - bounds.west) / Math.max(0.001, bounds.east - bounds.west)) * width;
  const y = ((bounds.north - location.latitude) / Math.max(0.001, bounds.north - bounds.south)) * height;
  return { x, y };
}

function moveParticle(particle: Particle, wind: WindSnapshot | WindData, viewport: WindViewport, dt: number): Particle {
  const localWind = sampleWind(wind, particle);
  const rad = (localWind.deg * Math.PI) / 180;
  const eastMeters = -Math.sin(rad) * localWind.speed * WIND_VISUAL_SPEEDUP * particle.seed * dt;
  const northMeters = Math.cos(rad) * localWind.speed * WIND_VISUAL_SPEEDUP * particle.seed * dt;
  const metersPerDegreeLongitude = METERS_PER_DEGREE_LATITUDE * Math.cos((particle.latitude * Math.PI) / 180);
  const latitude = particle.latitude + northMeters / METERS_PER_DEGREE_LATITUDE;
  const longitude = particle.longitude + eastMeters / Math.max(1, metersPerDegreeLongitude);
  const nextLocation = { latitude, longitude };
  const offscreen = !isInViewport(nextLocation, viewport) || particle.age > 620;

  if (offscreen) {
    return randomParticle(viewport);
  }

  return {
    ...particle,
    latitude,
    longitude,
    age: particle.age + 1,
    trail: [nextLocation, ...particle.trail].slice(0, TRAIL_POINTS),
  };
}

export function WindOverlay({ viewport, wind }: { viewport: WindViewport; wind: WindSnapshot | WindData }) {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [frame, setFrame] = useState(0);
  const particles = useRef<Particle[]>([]);
  const lastFrame = useRef<number | null>(null);
  const windRef = useRef(wind);
  windRef.current = wind;

  const avgSpeed = wind.speed;
  const windResetKey = 'grid' in wind ? wind.updatedAt : `${wind.speed}-${wind.deg}`;
  const viewportResetKey = viewportKey(viewport);
  const activeCount = Math.round(84 + (Math.min(avgSpeed, 18) / 18) * (PARTICLE_COUNT - 84));

  function handleLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setLayout((current) => (
      current.width === width && current.height === height
        ? current
        : { width, height }
    ));
  }

  useEffect(() => {
    if (layout.width <= 0 || layout.height <= 0) return;
    particles.current = Array.from({ length: PARTICLE_COUNT }, () => randomParticle(viewport));
    lastFrame.current = null;
  }, [layout.width, layout.height, viewportResetKey, windResetKey, viewport]);

  useEffect(() => {
    if (layout.width <= 0 || layout.height <= 0) return;

    let animationId: number;
    const animate = (stamp: number) => {
      const previous = lastFrame.current ?? stamp;
      const dt = Math.min(0.05, Math.max(0.001, (stamp - previous) / 1000));
      lastFrame.current = stamp;
      particles.current = particles.current.map((particle) => moveParticle(particle, windRef.current, viewport, dt));
      setFrame((value) => value + 1);
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationId);
  }, [layout.width, layout.height, viewport]);

  const renderedParticles = particles.current.slice(0, activeCount);
  void frame;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={handleLayout}>
      {renderedParticles.map((particle, index) => {
        const localWind = sampleWind(wind, particle);
        const color = windColor(localWind.speed);
        const opacity = 0.15 + Math.min(localWind.speed, 18) / 42;

        return particle.trail.map((location, trailIndex) => {
          const point = projectLocation(location, viewport, layout.width, layout.height);
          const progress = trailIndex / Math.max(1, TRAIL_POINTS - 1);
          const size = trailIndex === 0 ? 3.8 : Math.max(0.7, 2.6 - progress * 1.9);
          const fade = Math.max(0, (1 - progress) ** 2.45);
          return (
            <View
              key={`${index}-${trailIndex}`}
              style={{
                position: 'absolute',
                left: point.x - size / 2,
                top: point.y - size / 2,
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: color,
                opacity: opacity * fade,
              }}
            />
          );
        });
      })}
    </View>
  );
}
