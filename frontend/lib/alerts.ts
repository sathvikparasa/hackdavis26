export type AlertSeverity = 'High' | 'Moderate' | 'Low';

export type AlertItem = {
  id: string;
  reportId: string;
  userId: string | null;
  pest: string;
  crop: string;
  vulnerableCropLabel: string;
  vulnerableCropNames: string[];
  type: 'Insects' | 'Fungi' | 'Weeds' | 'Nematodes';
  severity: AlertSeverity;
  distanceMiles: number | null;
  distance: string;
  detected: string;
  time: string;
  latitude: number;
  longitude: number;
  confidence: number;
  spreadMethods: string[];
  travelDistanceMiles: number | null;
  travelDistance: string;
  vulnerableCrops: VulnerableCrop[];
  affectedFields: AffectedField[];
  recommendations: string[];
  imageUrl: string | null;
};

type ReportRow = {
  id: string;
  reporter_user_id: string | null | undefined;
  pest_name: string | null;
  latitude: number | null;
  longitude: number | null;
  confidence: number | null;
  travel_distance: number | null;
  spread_methods: string[] | null;
  vulnerable_crop: VulnerableCropRow[] | null;
  created_at: string | null;
  image_bucket: string | null;
  image_path: string | null;
};

type AffectedFieldRow = {
  report_id: string;
  field_id: number | null;
  risk_score: number | null;
  severity: string | null;
  distance: number | null;
  matched_methods: string[] | null;
  reasons: string[] | null;
};

type FieldRow = {
  id: number;
  unique_id: string | null;
  main_crop: string | null;
  main_crop_name: string | null;
  county: string | null;
  acres: number | null;
  region: string | null;
};

type VulnerableCropRow = {
  crop_type?: string | null;
  damage_type?: string | null;
  duration?: number | null;
  recommendations?: string | null;
};

export type VulnerableCrop = {
  cropType: string;
  damageType: string;
  durationDays: number | null;
  recommendations: string;
};

export type AffectedField = {
  fieldId: number | null;
  fieldName: string;
  crop: string;
  county: string | null;
  acres: number | null;
  riskScore: number | null;
  severity: AlertSeverity;
  distanceMiles: number | null;
  matchedMethods: string[];
  reasons: string[];
};

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

type FetchAlertsOptions = {
  affectedFieldIds?: Iterable<number> | null;
};

export async function fetchAlerts(options: FetchAlertsOptions = {}): Promise<AlertItem[]> {
  const reports = await supabaseGet<ReportRow[]>(
    '/rest/v1/reports?select=id,reporter_user_id,pest_name,latitude,longitude,confidence,travel_distance,spread_methods,vulnerable_crop,created_at,image_bucket,image_path&order=created_at.desc&limit=100'
  );

  if (reports.length === 0) {
    return [];
  }

  const reportIds = reports.map((report) => report.id);
  const affectedFields = await supabaseGet<AffectedFieldRow[]>(
    `/rest/v1/affected_fields?select=report_id,field_id,risk_score,severity,distance,matched_methods,reasons&report_id=in.(${reportIds.join(',')})&order=risk_score.desc`
  );
  const allowedAffectedFieldIds =
    options.affectedFieldIds === null || options.affectedFieldIds === undefined
      ? null
      : new Set(options.affectedFieldIds);
  const visibleAffectedFields =
    allowedAffectedFieldIds === null
      ? affectedFields
      : affectedFields.filter(
          (affectedField) =>
            typeof affectedField.field_id === 'number' &&
            allowedAffectedFieldIds.has(affectedField.field_id)
        );

  const fieldIds = [
    ...new Set(
      visibleAffectedFields
        .map((affectedField) => affectedField.field_id)
        .filter((fieldId): fieldId is number => typeof fieldId === 'number')
    ),
  ];
  const fields =
    fieldIds.length > 0
      ? await supabaseGet<FieldRow[]>(
          `/rest/v1/fields?select=id,unique_id,main_crop,main_crop_name,county,acres,region&id=in.(${fieldIds.join(',')})`
        )
      : [];
  const fieldsById = new Map(fields.map((field) => [field.id, field]));

  const topAffectedByReport = new Map<string, AffectedFieldRow>();
  const affectedByReport = new Map<string, AffectedField[]>();
  for (const affectedField of visibleAffectedFields) {
    if (!topAffectedByReport.has(affectedField.report_id)) {
      topAffectedByReport.set(affectedField.report_id, affectedField);
    }

    const field = affectedField.field_id ? fieldsById.get(affectedField.field_id) : undefined;
    const mapped = mapAffectedField(affectedField, field);
    const current = affectedByReport.get(affectedField.report_id) ?? [];
    current.push(mapped);
    affectedByReport.set(affectedField.report_id, current);
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
      const vulnerableCrops = (report.vulnerable_crop ?? []).map(mapVulnerableCrop);
      const vulnerableCropNames = [
        ...new Set(
          vulnerableCrops
            .map((vulnerableCrop) => vulnerableCrop.cropType.trim())
            .filter(Boolean)
            .map(titleCase)
        ),
      ];
      const vulnerableCropLabel = formatCropList(vulnerableCropNames, 'Unknown vulnerable crops');
      const recommendations = [
        ...new Set(
          vulnerableCrops
            .map((vulnerableCrop) => vulnerableCrop.recommendations.trim())
            .filter(Boolean)
        ),
      ];

      return {
        id: report.id,
        reportId: report.id,
        userId: report.reporter_user_id ?? null,
        pest,
        crop: vulnerableCropLabel,
        vulnerableCropLabel,
        vulnerableCropNames,
        type: classifyPest(pest),
        severity,
        distanceMiles,
        distance: formatDistance(distanceMiles),
        detected: createdAt ? formatDetected(createdAt) : 'Detected recently',
        time: createdAt ? formatTime(createdAt) : 'Recently',
        latitude: report.latitude as number,
        longitude: report.longitude as number,
        confidence: report.confidence ?? 0,
        spreadMethods: report.spread_methods ?? [],
        travelDistanceMiles: report.travel_distance ?? null,
        travelDistance: formatRadius(report.travel_distance ?? null),
        vulnerableCrops,
        affectedFields: affectedByReport.get(report.id) ?? [],
        recommendations,
        imageUrl:
          report.image_bucket && report.image_path
            ? `${SUPABASE_URL}/storage/v1/object/public/${report.image_bucket}/${report.image_path}`
            : null,
      };
    });
}


export async function fetchAlertById(id: string, options: FetchAlertsOptions = {}): Promise<AlertItem | null> {
  const alerts = await fetchAlerts(options);
  return alerts.find((alert) => alert.id === id) ?? null;
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
    throw new Error(
      'Missing EXPO_PUBLIC_SUPABASE_URL and either EXPO_PUBLIC_SUPABASE_ANON_KEY or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
    );
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

function mapAffectedField(affectedField: AffectedFieldRow, field?: FieldRow): AffectedField {
  return {
    fieldId: affectedField.field_id,
    fieldName: field?.unique_id || field?.region || `Field ${affectedField.field_id ?? 'unknown'}`,
    crop: titleCase(field?.main_crop_name || field?.main_crop || 'Unknown crop'),
    county: field?.county ?? null,
    acres: field?.acres ?? null,
    riskScore: affectedField.risk_score,
    severity: normalizeSeverity(affectedField.severity, affectedField.risk_score, null),
    distanceMiles: affectedField.distance,
    matchedMethods: affectedField.matched_methods ?? [],
    reasons: affectedField.reasons ?? [],
  };
}

function mapVulnerableCrop(value: VulnerableCropRow): VulnerableCrop {
  return {
    cropType: titleCase(value.crop_type || 'Unknown crop'),
    damageType: value.damage_type || 'Crop damage details unavailable.',
    durationDays: typeof value.duration === 'number' ? value.duration : null,
    recommendations: value.recommendations || 'No recommendation provided.',
  };
}

function formatCropList(crops: string[], fallback: string): string {
  if (crops.length === 0) {
    return fallback;
  }
  if (crops.length <= 2) {
    return crops.join(', ');
  }
  return `${crops.slice(0, 2).join(', ')} +${crops.length - 2}`;
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
  return `${rounded} mi away`;
}

function formatRadius(distance: number | null): string {
  if (distance === null) {
    return 'Radius unavailable';
  }
  const rounded = distance < 10 ? Math.round(distance * 10) / 10 : Math.round(distance);
  return `${rounded} mi radius`;
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
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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
