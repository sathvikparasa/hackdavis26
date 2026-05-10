const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export type ReportSubmitPayload = {
  cropType?: string;
  imageUri: string;
  latitude?: number;
  longitude?: number;
  reporterUserId?: string | null;
};

export class ReportSubmissionError extends Error {
  retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'ReportSubmissionError';
    this.retryable = retryable;
  }
}

export async function submitReport(payload: ReportSubmitPayload): Promise<string> {
  if (!API_BASE_URL) {
    throw new ReportSubmissionError('Missing EXPO_PUBLIC_API_BASE_URL.', false);
  }

  const formData = new FormData();
  formData.append('image', {
    uri: payload.imageUri,
    name: fileNameFromUri(payload.imageUri),
    type: mimeTypeFromUri(payload.imageUri),
  } as unknown as Blob);
  formData.append('crop_type', payload.cropType ?? 'unknown crop');
  formData.append('latitude', String(payload.latitude ?? 38.5449));
  formData.append('longitude', String(payload.longitude ?? -121.7405));
  if (payload.reporterUserId) {
    formData.append('reporter_user_id', payload.reporterUserId);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/reports`, {
      method: 'POST',
      body: formData,
    });
  } catch (error) {
    throw new ReportSubmissionError(
      error instanceof Error ? error.message : 'Network connection failed.',
      true
    );
  }

  if (!response.ok) {
    const message = await response.text();
    throw new ReportSubmissionError(message || 'Report upload failed.', response.status >= 500);
  }

  const data = await response.json();
  return data.report_id;
}

function fileNameFromUri(uri: string) {
  return uri.split('/').pop()?.split('?')[0] || 'report-image.jpg';
}

function mimeTypeFromUri(uri: string) {
  return uri.toLowerCase().includes('.png') ? 'image/png' : 'image/jpeg';
}
