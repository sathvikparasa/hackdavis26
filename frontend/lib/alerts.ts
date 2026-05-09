export type AlertSeverity = 'High' | 'Moderate' | 'Low';

export type AlertItem = {
  id: string;
  reportId: string;
  pest: string;
  crop: string;
  type: 'Insects' | 'Fungi' | 'Weeds' | 'Nematodes';
  severity: AlertSeverity;
  distanceMiles: number | null;
  distance: string;
  detected: string;
  time: string;
  latitude: number;
  longitude: number;
  confidence: number;
};

type ReportRow = {
  id: string;
  pest_name: string | null;
  crop_type: string | null;
  latitude: number | null;
  longitude: number | null;
  confidence: number | null;
  travel_distance: number | null;
  created_at: string | null;
};

type AffectedFieldRow = {
  report_id: string;
  risk_score: number | null;
  severity: string | null;
  distance: number | null;
};

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export async function fetchAlerts(): Promise<AlertItem[]> {
  const reports = await supabaseGet<ReportRow[]>(
    '/rest/v1/reports?select=id,pest_name,crop_type,latitude,longitude,confidence,travel_distance,created_at&order=created_at.desc&limit=100'
  );

  if (reports.length === 0) {
    return [];
  }

  const reportIds = reports.map((report) => report.id);
  const affectedFields = await supabaseGet<AffectedFieldRow[]>(
    `/rest/v1/affected_fields?select=report_id,risk_score,severity,distance&report_id=in.(${reportIds.join(',')})&order=risk_score.desc`
  );

  const topAffectedByReport = new Map<string, AffectedFieldRow>();
  for (const affectedField of affectedFields) {
    if (!topAffectedByReport.has(affectedField.report_id)) {
      topAffectedByReport.set(affectedField.report_id, affectedField);
    }
  }

  return reports
    .filter(
      (report) =>
        typeof report.latitude === 'number' &&
        typeof report.longitude === 'number'
    )
    .map((report) => {
      const affected = topAffectedByReport.get(report.id);
      const severity = normalizeSeverity(affected?.severity, affected?.risk_score, report.confidence);
      const distanceMiles = affected?.distance ?? report.travel_distance ?? null;
      const createdAt = report.created_at ? new Date(report.created_at) : null;
      const pest = report.pest_name || 'Unknown Pest';

      return {
        id: report.id,
        reportId: report.id,
        pest,
        crop: titleCase(report.crop_type || 'Unknown'),
        type: classifyPest(pest),
        severity,
        distanceMiles,
        distance: formatDistance(distanceMiles),
        detected: createdAt ? formatDetected(createdAt) : 'Detected recently',
        time: createdAt ? formatTime(createdAt) : 'Recently',
        latitude: report.latitude as number,
        longitude: report.longitude as number,
        confidence: report.confidence ?? 0,
      };
    });
}

export function projectAlerts(alerts: AlertItem[]) {
  if (alerts.length === 0) {
    return new Map<string, { x: number; y: number }>();
  }

  const minLat = 38.31;
  const maxLat = 39.05;
  const minLon = -122.43;
  const maxLon = -121.48;
  const latSpan = maxLat - minLat;
  const lonSpan = maxLon - minLon;
  const projected = new Map<string, { x: number; y: number }>();

  for (const alert of alerts) {
    projected.set(alert.id, {
      x: clamp(6 + ((alert.longitude - minLon) / lonSpan) * 88, 4, 96),
      y: clamp(6 + (1 - (alert.latitude - minLat) / latSpan) * 88, 4, 96),
    });
  }

  return projected;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function supabaseGet<T>(path: string): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  }

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Supabase request failed: ${response.status} ${details}`);
  }

  return response.json();
}

function normalizeSeverity(
  value: string | null | undefined,
  riskScore: number | null | undefined,
  confidence: number | null | undefined
): AlertSeverity {
  if (value === 'HIGH') {
    return 'High';
  }
  if (value === 'MEDIUM' || value === 'MODERATE') {
    return 'Moderate';
  }
  if (value === 'LOW') {
    return 'Low';
  }

  const score = riskScore ?? confidence ?? 0;
  if (score >= 0.7) {
    return 'High';
  }
  if (score >= 0.35) {
    return 'Moderate';
  }
  return 'Low';
}

function classifyPest(pest: string): AlertItem['type'] {
  const lower = pest.toLowerCase();
  if (lower.includes('spot') || lower.includes('blight') || lower.includes('mildew') || lower.includes('rot')) {
    return 'Fungi';
  }
  if (lower.includes('weed')) {
    return 'Weeds';
  }
  if (lower.includes('nematode')) {
    return 'Nematodes';
  }
  return 'Insects';
}

function formatDistance(distance: number | null): string {
  if (distance === null) {
    return 'Distance unavailable';
  }
  const rounded = distance < 10 ? Math.round(distance * 10) / 10 : Math.round(distance);
  return `${rounded} miles away`;
}

function formatDetected(date: Date): string {
  const days = daysAgo(date);
  if (days === 0) {
    return 'Detected today';
  }
  if (days === 1) {
    return 'Detected yesterday';
  }
  return `Detected ${days} days ago`;
}

function formatTime(date: Date): string {
  const days = daysAgo(date);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days === 0) {
    return `Today, ${time}`;
  }
  if (days === 1) {
    return `Yesterday, ${time}`;
  }
  return `${days} days ago`;
}

function daysAgo(date: Date): number {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(0, Math.floor((startOfToday.getTime() - startOfDate.getTime()) / 86400000));
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
