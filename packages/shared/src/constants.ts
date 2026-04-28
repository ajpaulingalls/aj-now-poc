export const API_BASE_URL = 'http://localhost:3001/api';

export const SYNC_INTERVAL_MS = 30_000;       // 30 seconds
export const CHECK_IN_INTERVAL_MS = 3_600_000; // 1 hour
export const MAX_SYNC_RETRIES = 5;
export const MEDIA_CHUNK_SIZE = 1024 * 1024;   // 1MB chunks for upload

export const PRIORITY_LABELS: Record<string, string> = {
  breaking: 'BREAKING',
  urgent: 'Urgent',
  standard: 'Standard',
  feature: 'Feature',
};

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  filed: 'Filed',
  review: 'In Review',
  approved: 'Approved',
  published: 'Published',
  rejected: 'Rejected',
  pending: 'Pending',
  accepted: 'Accepted',
  in_progress: 'In Progress',
};
