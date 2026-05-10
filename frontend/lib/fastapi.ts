export type SpreadMethod = 'wind' | 'water' | 'adjacency';

export type VulnerableCrop = {
  crop_type: string;
  damage_type: string;
  duration: number;
  recommendations: string;
};

export type AnalysisResponse = {
  spread_methods: SpreadMethod[];
  vulnerable_crop: VulnerableCrop[];
  travel_distance: number;
  pest_name: string;
  confidence: number;
};

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export type FieldAlert = {
  field_id: string;
  field_name: string;
  crop_type: string;
  risk_score: number;
  severity: AlertSeverity;
  distance: number;
  matched_methods: SpreadMethod[];
  reasons: string[];
};

export type SpreadResponse = {
  pest_name: string;
  alerts: FieldAlert[];
};

export type ReportResponse = {
  report_id: string;
  image_bucket: string;
  image_path: string;
  analysis: AnalysisResponse;
  spread: SpreadResponse;
};

export type SubmitReportInput = {
  imageUri: string;
  cropType: string;
  latitude: number;
  longitude: number;
  reporterUserId?: string | null;
};

const FASTAPI_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export async function submitReport(input: SubmitReportInput): Promise<ReportResponse> {
  if (!FASTAPI_BASE_URL) {
    throw new Error('Missing EXPO_PUBLIC_API_BASE_URL');
  }

  const formData = new FormData();
  formData.append('image', {
    uri: input.imageUri,
    name: imageNameFromUri(input.imageUri),
    type: mimeTypeFromUri(input.imageUri),
  } as unknown as Blob);
  formData.append('crop_type', input.cropType);
  formData.append('latitude', String(input.latitude));
  formData.append('longitude', String(input.longitude));

  if (input.reporterUserId) {
    formData.append('reporter_user_id', input.reporterUserId);
  }

  const response = await fetch(`${FASTAPI_BASE_URL.replace(/\/$/, '')}/reports`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`FastAPI /reports failed: ${response.status} ${details}`);
  }

  return response.json();
}

function imageNameFromUri(uri: string): string {
  const fallback = 'report-image.jpg';
  const fileName = uri.split('/').pop()?.split('?')[0];
  return fileName || fallback;
}

function mimeTypeFromUri(uri: string): string {
  const extension = uri.split('?')[0].split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    case 'heif':
      return 'image/heif';
    case 'jpg':
    case 'jpeg':
    default:
      return 'image/jpeg';
  }
}
