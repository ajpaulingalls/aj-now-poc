// ============================
// User & Auth
// ============================
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'correspondent' | 'editor' | 'producer' | 'admin';
  bureau: string;
  avatarUrl?: string;
  phone?: string;
  emergencyContact?: {
    name: string;
    phone: string;
    relationship: string;
  };
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  biometricEnabled: boolean;
}

// ============================
// Assignments
// ============================
export type AssignmentPriority = 'breaking' | 'urgent' | 'standard' | 'feature';
export type AssignmentStatus = 'pending' | 'accepted' | 'in_progress' | 'filed' | 'published';

export interface Assignment {
  id: string;
  title: string;
  slug: string;
  description: string;
  priority: AssignmentPriority;
  status: AssignmentStatus;
  assignedTo: string;      // user ID
  assignedBy: string;      // editor user ID
  bureau: string;
  location?: GeoLocation;
  deadline?: string;       // ISO date
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// ============================
// Stories / Filed Content
// ============================
export type StoryStatus = 'draft' | 'filed' | 'review' | 'approved' | 'published' | 'rejected';
export type MediaType = 'photo' | 'video' | 'audio' | 'document';

export interface MediaAttachment {
  id: string;
  type: MediaType;
  uri: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  durationMs?: number;
  width?: number;
  height?: number;
  caption?: string;
  location?: GeoLocation;
  capturedAt: string;
  uploadStatus: 'pending' | 'uploading' | 'uploaded' | 'failed';
  uploadProgress?: number;
}

export interface Story {
  id: string;
  assignmentId?: string;
  headline: string;
  slug: string;
  body: string;
  summary?: string;
  tags: string[];
  location?: GeoLocation;
  media: MediaAttachment[];
  status: StoryStatus;
  filedBy: string;
  filedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================
// Capture
// ============================
export interface CaptureSession {
  id: string;
  assignmentId?: string;
  media: MediaAttachment[];
  notes: string;
  location?: GeoLocation;
  startedAt: string;
}

// ============================
// Location & Safety
// ============================
export interface GeoLocation {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  timestamp: string;
  placeName?: string;
}

export type SafetyStatus = 'safe' | 'check_in_due' | 'alert' | 'emergency';

export interface SafetyCheckIn {
  id: string;
  userId: string;
  location: GeoLocation;
  status: SafetyStatus;
  message?: string;
  timestamp: string;
}

// ============================
// Sync Queue (Offline-first)
// ============================
export type SyncAction = 'create' | 'update' | 'delete' | 'upload';

export interface SyncQueueItem {
  id: string;
  entityType: 'story' | 'media' | 'checkin' | 'assignment';
  entityId: string;
  action: SyncAction;
  payload: Record<string, unknown>;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  lastAttempt?: string;
  error?: string;
}

// ============================
// API
// ============================
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    page: number;
    pageSize: number;
    total: number;
  };
}
