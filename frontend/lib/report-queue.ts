import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import { ReportSubmissionError, submitReport, type ReportSubmitPayload } from '@/lib/report-submit';

const QUEUE_KEY = 'anticipate.pendingReports.v1';
const REPORT_IMAGE_DIR = `${FileSystem.documentDirectory ?? ''}pending-reports/`;

export type PendingReport = {
  attemptCount: number;
  createdAt: string;
  cropType: string;
  imageUri: string;
  lastError?: string | null;
  latitude: number;
  localId: string;
  longitude: number;
  reporterUserId?: string | null;
  status: 'pending' | 'uploading' | 'failed';
  updatedAt: string;
};

type QueueListener = (reports: PendingReport[]) => void;

const listeners = new Set<QueueListener>();
let processing = false;

export function subscribeToPendingReports(listener: QueueListener) {
  listeners.add(listener);
  void getPendingReports().then(listener);

  return () => {
    listeners.delete(listener);
  };
}

export async function enqueuePendingReport(payload: ReportSubmitPayload): Promise<PendingReport> {
  const now = new Date().toISOString();
  const localId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const imageUri = await persistReportImage(payload.imageUri, localId);
  const report: PendingReport = {
    attemptCount: 0,
    createdAt: now,
    cropType: payload.cropType ?? 'unknown crop',
    imageUri,
    lastError: null,
    latitude: payload.latitude ?? 38.5449,
    localId,
    longitude: payload.longitude ?? -121.7405,
    reporterUserId: payload.reporterUserId ?? null,
    status: 'pending',
    updatedAt: now,
  };

  const reports = await getPendingReports();
  await savePendingReports([report, ...reports]);
  return report;
}

export async function getPendingReports(): Promise<PendingReport[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPendingReport) : [];
  } catch {
    return [];
  }
}

export async function removePendingReport(localId: string) {
  const reports = await getPendingReports();
  const report = reports.find((item) => item.localId === localId);
  await savePendingReports(reports.filter((item) => item.localId !== localId));
  if (report?.imageUri.startsWith(FileSystem.documentDirectory ?? '')) {
    await FileSystem.deleteAsync(report.imageUri, { idempotent: true });
  }
}

export async function processPendingReports(
  options: { includeFailed?: boolean; reporterUserId?: string | null } = {}
) {
  if (processing) {
    return;
  }

  processing = true;
  try {
    const reports = await getPendingReports();
    for (const report of reports) {
      if (report.status === 'failed' && !options.includeFailed) {
        continue;
      }
      await processPendingReport(report, options.reporterUserId);
    }
  } finally {
    processing = false;
  }
}

async function processPendingReport(report: PendingReport, fallbackReporterUserId?: string | null) {
  const uploadingReport = {
    ...report,
    lastError: null,
    status: 'uploading' as const,
    updatedAt: new Date().toISOString(),
  };
  await updatePendingReport(uploadingReport);

  try {
    await submitReport({
      cropType: report.cropType,
      imageUri: report.imageUri,
      latitude: report.latitude,
      longitude: report.longitude,
      reporterUserId: report.reporterUserId ?? fallbackReporterUserId ?? null,
    });
    await removePendingReport(report.localId);
  } catch (error) {
    const retryable = error instanceof ReportSubmissionError ? error.retryable : true;
    await updatePendingReport({
      ...report,
      attemptCount: report.attemptCount + 1,
      lastError: error instanceof Error ? error.message : 'Upload failed.',
      status: retryable ? 'pending' : 'failed',
      updatedAt: new Date().toISOString(),
    });
  }
}

async function updatePendingReport(nextReport: PendingReport) {
  const reports = await getPendingReports();
  await savePendingReports(
    reports.map((report) => (report.localId === nextReport.localId ? nextReport : report))
  );
}

async function savePendingReports(reports: PendingReport[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(reports));
  listeners.forEach((listener) => listener(reports));
}

async function persistReportImage(imageUri: string, localId: string) {
  if (!FileSystem.documentDirectory || !imageUri.startsWith('file:')) {
    return imageUri;
  }

  await FileSystem.makeDirectoryAsync(REPORT_IMAGE_DIR, { intermediates: true });
  const extension = imageUri.split('.').pop()?.split('?')[0] || 'jpg';
  const destination = `${REPORT_IMAGE_DIR}${localId}.${extension}`;
  await FileSystem.copyAsync({ from: imageUri, to: destination });
  return destination;
}

function isPendingReport(value: unknown): value is PendingReport {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<PendingReport>;
  return (
    typeof candidate.localId === 'string' &&
    typeof candidate.imageUri === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.cropType === 'string' &&
    typeof candidate.latitude === 'number' &&
    typeof candidate.longitude === 'number'
  );
}
