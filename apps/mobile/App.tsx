import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Assignment, MediaAttachment, MediaType, SafetyCheckIn, SafetyStatus, Story, User } from '@aj-now/shared';
import { colors, spacing } from '@aj-now/shared';

const cloud = {
  blue: '#5EA7FF',
  blueDark: '#1D4ED8',
  blueSoft: '#EAF4FF',
  sky: '#F4FAFF',
  mint: '#DDF8EF',
  peach: '#FFF1DE',
  lavender: '#F0ECFF',
  ink: '#0F172A',
  muted: '#64748B',
  line: '#D8E7F5',
  white: '#FFFFFF',
};

const softShadow = Platform.select({
  web: {
    boxShadow: '0 18px 45px rgba(30, 64, 175, 0.10)',
  },
  default: {
    shadowColor: '#2563EB',
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
});


type ApiEnvelope<T> = { success: boolean; data?: T; error?: string };
type LocalDraft = {
  id: string;
  title: string;
  body: string;
  assignmentId?: string;
  summary?: string;
  tags: string[];
  mediaAttachments: MediaAttachment[];
  status: 'queued' | 'syncing';
  createdAt: string;
  updatedAt: string;
};
type LocalSafetyCheckIn = Omit<SafetyCheckIn, 'status'> & { status: SafetyStatus | 'syncing' };
type SyncPushResponse = {
  processed: number;
  accepted: number;
  rejected: number;
  total: number;
  results: Array<{ id?: string; type?: string; status: 'accepted' | 'rejected'; serverId?: string; error?: string }>;
};
type MediaUploadResponse = {
  id: string;
  storyId?: string | null;
  type: MediaType;
  uri: string;
  url?: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadStatus: 'uploaded';
};
type TabKey = 'briefing' | 'assignments' | 'capture' | 'offline' | 'safety' | 'profile';

const DEFAULT_API_BASE = 'http://localhost:3001/api';
const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE;
const IS_WEB = Platform.OS === 'web';
const LOCAL_DRAFTS_KEY = '@aj-now/local-drafts:v1';
const LOCAL_SAFETY_QUEUE_KEY = '@aj-now/local-safety-checkins:v1';
const DEMO_EMAIL = 'demo@aljazeera.net';

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'briefing', label: 'Briefing' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'capture', label: 'Capture' },
  { key: 'offline', label: 'Offline' },
  { key: 'safety', label: 'Safety' },
  { key: 'profile', label: 'Profile' },
];

const priorityColor: Record<string, string> = {
  breaking: '#E31B23',
  urgent: '#F59E0B',
  standard: '#2563EB',
  feature: '#7C3AED',
};

const mediaTypeLabels: Record<MediaType, string> = {
  photo: 'Photo',
  video: 'Video',
  audio: 'Audio',
  document: 'Document',
};

const mediaTypeIcons: Record<MediaType, string> = {
  photo: '📷',
  video: '🎥',
  audio: '🎙️',
  document: '📄',
};

const mediaTypeMimeDefaults: Record<MediaType, string> = {
  photo: 'image/jpeg',
  video: 'video/mp4',
  audio: 'audio/m4a',
  document: 'application/pdf',
};

const mediaTypeExtensions: Record<MediaType, string> = {
  photo: 'jpg',
  video: 'mp4',
  audio: 'm4a',
  document: 'pdf',
};

function makeLocalDraftId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeMediaId() {
  return `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function filenameFromUri(uri: string, fallbackType: MediaType, capturedAt: string) {
  const pathFilename = uri.split('/').pop()?.split('?')[0];
  if (pathFilename?.includes('.')) return pathFilename;

  return `${fallbackType}-${capturedAt.replace(/[:.]/g, '-')}.${mediaTypeExtensions[fallbackType]}`;
}

async function fileSizeForUri(uri: string) {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    return info.exists && typeof info.size === 'number' ? info.size : 0;
  } catch {
    return 0;
  }
}

function makePickerMediaAttachment(type: Extract<MediaType, 'photo' | 'video'>, asset: ImagePicker.ImagePickerAsset): MediaAttachment {
  const capturedAt = new Date().toISOString();

  return {
    id: makeMediaId(),
    type,
    uri: asset.uri,
    filename: asset.fileName ?? filenameFromUri(asset.uri, type, capturedAt),
    mimeType: asset.mimeType ?? mediaTypeMimeDefaults[type],
    sizeBytes: asset.fileSize ?? 0,
    durationMs: asset.duration ?? undefined,
    width: asset.width,
    height: asset.height,
    caption: `${mediaTypeLabels[type]} from field capture`,
    capturedAt,
    uploadStatus: 'pending',
  };
}

function makeAudioMediaAttachment(uri: string, sizeBytes: number, durationMs?: number): MediaAttachment {
  const capturedAt = new Date().toISOString();

  return {
    id: makeMediaId(),
    type: 'audio',
    uri,
    filename: filenameFromUri(uri, 'audio', capturedAt),
    mimeType: mediaTypeMimeDefaults.audio,
    sizeBytes,
    durationMs,
    caption: 'Audio from field capture',
    capturedAt,
    uploadStatus: 'pending',
  };
}

function makeDocumentMediaAttachment(asset: DocumentPicker.DocumentPickerAsset): MediaAttachment {
  const capturedAt = new Date().toISOString();
  const filename = asset.name || filenameFromUri(asset.uri, 'document', capturedAt);

  return {
    id: makeMediaId(),
    type: 'document',
    uri: asset.uri,
    filename,
    mimeType: asset.mimeType ?? mediaTypeMimeDefaults.document,
    sizeBytes: asset.size ?? 0,
    caption: 'Document from phone files',
    capturedAt,
    uploadStatus: 'pending',
  };
}

function formatBytes(sizeBytes?: number) {
  if (!sizeBytes) return 'Size pending';
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(value?: string) {
  if (!value) return 'No deadline';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatAssignmentLocation(assignment: Assignment) {
  if (!assignment.location) return 'Not specified';
  return assignment.location.placeName || `${assignment.location.latitude.toFixed(2)}, ${assignment.location.longitude.toFixed(2)}`;
}

function buildApiUrl(path: string) {
  return `${API_BASE}${path}`;
}

function buildServerUrl(path: string) {
  const apiRoot = API_BASE.replace(/\/api\/?$/, '');
  return `${apiRoot}${path.startsWith('/') ? path : `/${path}`}`;
}

function requestHeaders(options?: RequestInit) {
  const headers = new Headers(options?.headers);
  if (!(options?.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers: requestHeaders(options),
  });
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload.data as T;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('briefing');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [safetyHistory, setSafetyHistory] = useState<SafetyCheckIn[]>([]);
  const [localSafetyCheckIns, setLocalSafetyCheckIns] = useState<LocalSafetyCheckIn[]>([]);
  const [localSafetyLoaded, setLocalSafetyLoaded] = useState(false);
  const [safetyMessage, setSafetyMessage] = useState('Checking in from current assignment location.');
  const [safetyStatus, setSafetyStatus] = useState<SafetyStatus>('safe');
  const [safetyNotice, setSafetyNotice] = useState<string | null>(null);
  const [safetyLoading, setSafetyLoading] = useState(false);
  const [localDrafts, setLocalDrafts] = useState<LocalDraft[]>([]);
  const [localDraftsLoaded, setLocalDraftsLoaded] = useState(false);
  const [_syncingDraftId, setSyncingDraftId] = useState<string | null>(null);
  const [_draftNotice, setDraftNotice] = useState<string | null>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [focusedAssignmentId, setFocusedAssignmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [backendMessage, setBackendMessage] = useState('Checking newsroom API...');
  const [draftTitle, setDraftTitle] = useState('Market reaction from Doha');
  const [draftBody, setDraftBody] = useState(
    'Early interviews suggest residents are watching regional inflation and fuel prices closely while government officials prepare a new policy briefing.'
  );
  const [mediaAttachments, setMediaAttachments] = useState<MediaAttachment[]>([]);
  const [isCapturingMedia, setIsCapturingMedia] = useState<MediaType | null>(null);
  const [audioRecording, setAudioRecording] = useState<Audio.Recording | null>(null);
  const [audioStartedAt, setAudioStartedAt] = useState<number | null>(null);

  const breakingAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.priority === 'breaking' || assignment.priority === 'urgent'),
    [assignments]
  );

  const activeAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.status !== 'filed' && assignment.status !== 'published'),
    [assignments]
  );

  const selectedAssignment = useMemo(
    () => assignments.find((assignment) => assignment.id === selectedAssignmentId),
    [assignments, selectedAssignmentId]
  );

  const focusedAssignment = useMemo(
    () => assignments.find((assignment) => assignment.id === focusedAssignmentId),
    [assignments, focusedAssignmentId]
  );

  async function checkBackendStatus() {
    setBackendStatus('checking');
    setBackendMessage('Checking newsroom API...');
    try {
      const response = await fetch(buildApiUrl('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: DEMO_EMAIL, password: 'demo' }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setBackendStatus('online');
      setBackendMessage(`Connected to ${API_BASE}`);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      setBackendStatus('offline');
      setBackendMessage(`Cannot reach ${API_BASE}: ${message}`);
      return false;
    }
  }

  async function loadData(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setError(null);
    setBackendStatus('checking');
    try {
      const login = await api<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: DEMO_EMAIL, password: 'demo' }),
      });
      const [assignmentData, storyData, checkInData] = await Promise.all([
        api<Assignment[]>(`/assignments?userId=${login.user.id}`),
        api<Story[]>(`/stories?userId=${login.user.id}`),
        api<SafetyCheckIn[]>(`/safety/history?userId=${login.user.id}`),
      ]);
      setUser(login.user);
      setAssignments(assignmentData);
      setStories(storyData);
      setSafetyHistory(checkInData);
      setBackendStatus('online');
      setBackendMessage(`Connected to ${API_BASE}`);
      setSelectedAssignmentId((current) => {
        if (current && assignmentData.some((assignment) => assignment.id === current)) return current;
        const nextActiveAssignment = assignmentData.find(
          (assignment) => assignment.status !== 'filed' && assignment.status !== 'published'
        );
        return nextActiveAssignment?.id ?? null;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load Reporter App data';
      setBackendStatus('offline');
      setBackendMessage(`Cannot reach ${API_BASE}: ${message}`);
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadData();
    loadLocalDrafts();
    loadLocalSafetyCheckIns();
  }, []);

  useEffect(() => {
    if (!localDraftsLoaded) return;
    AsyncStorage.setItem(LOCAL_DRAFTS_KEY, JSON.stringify(localDrafts)).catch(() => {
      // Local persistence failure should not block capture; the UI still keeps in-memory drafts.
    });
  }, [localDrafts, localDraftsLoaded]);

  useEffect(() => {
    if (!localSafetyLoaded) return;
    AsyncStorage.setItem(LOCAL_SAFETY_QUEUE_KEY, JSON.stringify(localSafetyCheckIns)).catch(() => {
      // Local persistence failure should not block check-ins; the UI still keeps in-memory items.
    });
  }, [localSafetyCheckIns, localSafetyLoaded]);

  async function refresh() {
    setRefreshing(true);
    await loadData(false);
  }

  async function retryBackendConnection() {
    const ok = await checkBackendStatus();
    if (ok) {
      await loadData(false);
    }
  }

  async function loadLocalDrafts() {
    try {
      const raw = await AsyncStorage.getItem(LOCAL_DRAFTS_KEY);
      const parsed = raw ? (JSON.parse(raw) as LocalDraft[]) : [];
      setLocalDrafts(Array.isArray(parsed) ? parsed : []);
    } catch {
      setDraftNotice('Unable to restore saved offline drafts on this device.');
    } finally {
      setLocalDraftsLoaded(true);
    }
  }

  async function loadLocalSafetyCheckIns() {
    try {
      const raw = await AsyncStorage.getItem(LOCAL_SAFETY_QUEUE_KEY);
      const parsed = raw ? (JSON.parse(raw) as LocalSafetyCheckIn[]) : [];
      setLocalSafetyCheckIns(Array.isArray(parsed) ? parsed : []);
    } catch {
      setSafetyNotice('Unable to restore saved offline safety check-ins on this device.');
    } finally {
      setLocalSafetyLoaded(true);
    }
  }

  function buildLocalDraft(): LocalDraft {
    const now = new Date().toISOString();
    return {
      id: makeLocalDraftId(),
      title: draftTitle.trim() || 'Untitled field draft',
      body: draftBody.trim(),
      assignmentId: selectedAssignmentId ?? undefined,
      tags: ['offline', 'field-report'],
      mediaAttachments,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    };
  }

  async function saveOfflineDraft(showAlert = true) {
    if (!draftBody.trim() && !draftTitle.trim()) {
      Alert.alert('Nothing to save', 'Add a title or field notes before saving an offline draft.');
      return null;
    }
    const draft = buildLocalDraft();
    setLocalDrafts((current) => [draft, ...current]);
    setDraftTitle('');
    setDraftBody('');
    setMediaAttachments([]);
    setDraftNotice(
      selectedAssignment
        ? `Draft saved to offline queue for ${selectedAssignment.title}.`
        : 'Draft saved to the offline queue without an assignment link.'
    );
    setActiveTab('offline');
    if (showAlert) Alert.alert('Saved offline', 'This draft will remain on this device until you sync or discard it.');
    return draft;
  }

  function localDraftToSyncItem(draft: LocalDraft) {
    return {
      id: draft.id,
      type: 'draft',
      payload: {
        ...draft,
        authorId: user?.id,
        language: 'en',
        status: 'draft',
      },
    };
  }

  function localSafetyCheckInToSyncItem(checkIn: LocalSafetyCheckIn) {
    return {
      id: checkIn.id,
      type: 'safety_checkin',
      payload: {
        id: checkIn.id,
        userId: checkIn.userId,
        location: checkIn.location,
        status: checkIn.status === 'syncing' ? 'alert' : checkIn.status,
        message: checkIn.message,
        timestamp: checkIn.timestamp,
      },
    };
  }

  async function pushSyncItems(items: Array<ReturnType<typeof localDraftToSyncItem> | ReturnType<typeof localSafetyCheckInToSyncItem>>) {
    return api<SyncPushResponse>('/sync/push', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  }

  function appendFormField(form: FormData, key: string, value: unknown) {
    if (value === undefined || value === null || value === '') return;
    form.append(key, String(value));
  }

  async function uploadMediaAttachment(attachment: MediaAttachment, storyId: string): Promise<MediaAttachment> {
    const form = new FormData();
    form.append('file', {
      uri: attachment.uri,
      name: attachment.filename,
      type: attachment.mimeType,
    } as unknown as Blob);
    appendFormField(form, 'storyId', storyId);
    appendFormField(form, 'type', attachment.type);
    appendFormField(form, 'filename', attachment.filename);
    appendFormField(form, 'mimeType', attachment.mimeType);
    appendFormField(form, 'sizeBytes', attachment.sizeBytes);
    appendFormField(form, 'durationMs', attachment.durationMs);
    appendFormField(form, 'width', attachment.width);
    appendFormField(form, 'height', attachment.height);
    appendFormField(form, 'caption', attachment.caption);
    appendFormField(form, 'capturedAt', attachment.capturedAt);
    appendFormField(form, 'latitude', attachment.location?.latitude);
    appendFormField(form, 'longitude', attachment.location?.longitude);

    const response = await fetch(buildApiUrl('/media/upload'), {
      method: 'POST',
      body: form,
    });
    const payload = (await response.json()) as ApiEnvelope<MediaUploadResponse>;
    if (!response.ok || !payload.success || !payload.data) {
      throw new Error(payload.error || `Upload failed: ${response.status}`);
    }
    const uploaded = payload.data;

    return {
      ...attachment,
      id: uploaded.id || attachment.id,
      uri: uploaded.url ? buildServerUrl(uploaded.url) : uploaded.uri ? buildServerUrl(uploaded.uri) : attachment.uri,
      filename: uploaded.filename || attachment.filename,
      mimeType: uploaded.mimeType || attachment.mimeType,
      sizeBytes: uploaded.sizeBytes || attachment.sizeBytes,
      uploadStatus: 'uploaded',
      uploadProgress: 1,
    };
  }

  async function uploadStoryAttachments(attachments: MediaAttachment[], storyId: string, draftId?: string) {
    const uploaded: MediaAttachment[] = [];

    for (const attachment of attachments) {
      if (attachment.uploadStatus === 'uploaded') {
        uploaded.push(attachment);
        continue;
      }

      if (draftId) {
        setLocalDrafts((current) =>
          current.map((draft) =>
            draft.id === draftId
              ? {
                  ...draft,
                  mediaAttachments: draft.mediaAttachments.map((item) =>
                    item.id === attachment.id ? { ...item, uploadStatus: 'uploading', uploadProgress: 0.5 } : item
                  ),
                }
              : draft
          )
        );
      }

      const uploadedAttachment = await uploadMediaAttachment({ ...attachment, uploadStatus: 'uploading' }, storyId);
      uploaded.push(uploadedAttachment);

      if (draftId) {
        setLocalDrafts((current) =>
          current.map((draft) =>
            draft.id === draftId
              ? {
                  ...draft,
                  mediaAttachments: draft.mediaAttachments.map((item) =>
                    item.id === attachment.id ? uploadedAttachment : item
                  ),
                }
              : draft
          )
        );
      }
    }

    return uploaded;
  }

  async function _syncLocalDraft(draft: LocalDraft) {
    if (!user) {
      Alert.alert('Profile unavailable', 'Refresh the app before syncing local drafts.');
      return;
    }
    setSyncingDraftId(draft.id);
    setLocalDrafts((current) => current.map((item) => (item.id === draft.id ? { ...item, status: 'syncing' } : item)));
    try {
      const response = await pushSyncItems([localDraftToSyncItem(draft)]);
      const result = response.results.find((item) => item.id === draft.id);
      if (!result || result.status !== 'accepted' || !result.serverId) {
        throw new Error(result?.error || 'Draft was not accepted by the sync endpoint.');
      }
      const uploadedAttachments = await uploadStoryAttachments(draft.mediaAttachments, result.serverId, draft.id);
      setLocalDrafts((current) => current.filter((item) => item.id !== draft.id));
      const uploadedCount = uploadedAttachments.filter((attachment) => attachment.uploadStatus === 'uploaded').length;
      setDraftNotice(
        uploadedCount > 0
          ? `Offline draft synced with ${uploadedCount} attachment${uploadedCount === 1 ? '' : 's'} uploaded.`
          : 'Offline draft synced to the newsroom draft queue.'
      );
      loadData(false);
    } catch (err) {
      setLocalDrafts((current) => current.map((item) => (item.id === draft.id ? { ...item, status: 'queued' } : item)));
      const message = err instanceof Error ? err.message : 'Draft remains safely queued offline.';
      setDraftNotice(`Sync/upload failed: ${message}`);
      Alert.alert('Unable to sync draft', message);
    } finally {
      setSyncingDraftId(null);
    }
  }

  async function _syncQueuedItems() {
    if (!user) {
      Alert.alert('Profile unavailable', 'Refresh the app before syncing queued items.');
      return;
    }

    const queuedDrafts = localDrafts.filter((item) => item.status === 'queued');
    const queuedSafetyCheckIns = localSafetyCheckIns.filter((item) => item.status !== 'syncing');

    if (queuedDrafts.length === 0 && queuedSafetyCheckIns.length === 0) {
      setDraftNotice('No offline items are waiting to sync.');
      return;
    }

    setLocalDrafts((current) => current.map((item) => (item.status === 'queued' ? { ...item, status: 'syncing' } : item)));
    setLocalSafetyCheckIns((current) => current.map((item) => ({ ...item, status: 'syncing' })));

    try {
      const response = await pushSyncItems([
        ...queuedDrafts.map(localDraftToSyncItem),
        ...queuedSafetyCheckIns.map(localSafetyCheckInToSyncItem),
      ]);
      const acceptedIds = new Set(response.results.filter((item) => item.status === 'accepted').map((item) => item.id));
      const draftResults = new Map(response.results.filter((item) => item.status === 'accepted' && item.id).map((item) => [item.id as string, item]));
      let uploadedCount = 0;
      for (const draft of queuedDrafts) {
        const result = draftResults.get(draft.id);
        if (!result?.serverId || draft.mediaAttachments.length === 0) continue;
        const uploadedAttachments = await uploadStoryAttachments(draft.mediaAttachments, result.serverId, draft.id);
        uploadedCount += uploadedAttachments.filter((attachment) => attachment.uploadStatus === 'uploaded').length;
      }
      setLocalDrafts((current) =>
        current
          .filter((item) => !acceptedIds.has(item.id))
          .map((item) => (item.status === 'syncing' ? { ...item, status: 'queued' } : item))
      );
      setLocalSafetyCheckIns((current) =>
        current
          .filter((item) => !acceptedIds.has(item.id))
          .map((item) => (item.status === 'syncing' ? { ...item, status: 'alert' } : item))
      );
      setDraftNotice(
        uploadedCount > 0
          ? `Synced ${response.accepted} offline item${response.accepted === 1 ? '' : 's'} and uploaded ${uploadedCount} attachment${uploadedCount === 1 ? '' : 's'} to the newsroom.`
          : `Synced ${response.accepted} offline item${response.accepted === 1 ? '' : 's'} to the newsroom.`
      );
      if (response.rejected > 0) {
        setSafetyNotice(`${response.rejected} offline item${response.rejected === 1 ? '' : 's'} still need attention.`);
      } else {
        setSafetyNotice('Offline safety check-ins synced to the safety desk.');
      }
      loadData(false);
    } catch (err) {
      setLocalDrafts((current) => current.map((item) => (item.status === 'syncing' ? { ...item, status: 'queued' } : item)));
      setLocalSafetyCheckIns((current) =>
        current.map((item) => (item.status === 'syncing' ? { ...item, status: 'alert' } : item))
      );
      const message = err instanceof Error ? err.message : 'Items remain safely queued offline.';
      setDraftNotice(`Sync/upload failed: ${message}`);
      Alert.alert('Unable to sync offline items', message);
    }
  }

  function _discardLocalDraft(draft: LocalDraft) {
    Alert.alert('Discard offline draft?', draft.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          setLocalDrafts((current) => current.filter((item) => item.id !== draft.id));
          setDraftNotice('Offline draft discarded.');
        },
      },
    ]);
  }

  function openAssignmentDetail(assignment: Assignment) {
    setFocusedAssignmentId(assignment.id);
    setSelectedAssignmentId(assignment.id);
    setActiveTab('assignments');
  }

  async function ensureCameraPermission() {
    if (IS_WEB) return true;
    const result = await ImagePicker.requestCameraPermissionsAsync();
    if (!result.granted) {
      Alert.alert('Camera access needed', 'Enable camera permissions to capture photos and videos for this story.');
      return false;
    }

    return true;
  }

  async function ensureMicrophonePermission() {
    if (IS_WEB) return true;
    const result = await Audio.requestPermissionsAsync();
    if (!result.granted) {
      Alert.alert('Microphone access needed', 'Enable microphone permissions to record audio for this story.');
      return false;
    }

    return true;
  }

  async function addCapturedMediaAttachment(type: Extract<MediaType, 'photo' | 'video'>) {
    if (isCapturingMedia) return;

    const hasPermission = await ensureCameraPermission();
    if (!hasPermission) return;

    setIsCapturingMedia(type);
    try {
      const result = await (IS_WEB ? ImagePicker.launchImageLibraryAsync : ImagePicker.launchCameraAsync)({
        mediaTypes: type === 'photo' ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: type === 'photo' ? 0.82 : 1,
        videoMaxDuration: 180,
      });

      if (result.canceled || !result.assets.length) {
        setDraftNotice(`${mediaTypeLabels[type]} capture cancelled.`);
        return;
      }

      const attachment = makePickerMediaAttachment(type, result.assets[0]);
      setMediaAttachments((current) => [attachment, ...current]);
      setDraftNotice(`${mediaTypeLabels[type]} ${IS_WEB ? 'selected' : 'captured'} and attached to this draft.`);
    } catch (error) {
      console.error(`Failed to capture ${type}`, error);
      Alert.alert('Capture failed', `Could not capture ${mediaTypeLabels[type].toLowerCase()}. Please try again.`);
    } finally {
      setIsCapturingMedia(null);
    }
  }

  async function addWebTestAttachment() {
    const capturedAt = new Date().toISOString();
    const content = `AJ Now Expo Web test attachment\nCreated: ${capturedAt}\nHeadline: ${draftTitle || 'Untitled'}\n`;
    const blob = new Blob([content], { type: 'text/plain' });
    const attachment: MediaAttachment = {
      id: makeMediaId(),
      type: 'document',
      uri: URL.createObjectURL(blob),
      filename: `expo-web-test-${Date.now()}.txt`,
      mimeType: 'text/plain',
      sizeBytes: blob.size,
      caption: 'Generated Expo Web smoke-test attachment',
      capturedAt,
      uploadStatus: 'pending',
    };
    setMediaAttachments((current) => [attachment, ...current]);
    setDraftNotice('Generated a small text attachment for Expo Web upload testing.');
  }

  async function startAudioRecording() {
    if (IS_WEB) {
      addWebTestAttachment();
      return;
    }
    if (audioRecording || isCapturingMedia) return;

    const hasPermission = await ensureMicrophonePermission();
    if (!hasPermission) return;

    setIsCapturingMedia('audio');
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setAudioRecording(recording);
      setAudioStartedAt(Date.now());
      setDraftNotice('Recording audio… tap Stop when finished.');
    } catch (error) {
      console.error('Failed to start audio recording', error);
      setIsCapturingMedia(null);
      Alert.alert('Recording failed', 'Could not start audio recording. Please try again.');
    }
  }

  async function _stopAudioRecording() {
    if (!audioRecording) return;

    const recording = audioRecording;
    const startedAt = audioStartedAt;
    setAudioRecording(null);
    setAudioStartedAt(null);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (!uri) {
        setDraftNotice('Audio recording stopped, but no file was created.');
        return;
      }

      const status = await recording.getStatusAsync();
      const sizeBytes = await fileSizeForUri(uri);
      const durationMs = 'durationMillis' in status && typeof status.durationMillis === 'number' ? status.durationMillis : startedAt ? Date.now() - startedAt : undefined;
      setMediaAttachments((current) => [makeAudioMediaAttachment(uri, sizeBytes, durationMs), ...current]);
      setDraftNotice('Audio recording attached to this draft.');
    } catch (error) {
      console.error('Failed to stop audio recording', error);
      Alert.alert('Recording failed', 'Could not save audio recording. Please try again.');
    } finally {
      setIsCapturingMedia(null);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    }
  }

  async function attachDocument() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: '*/*',
      });

      if (result.canceled || result.assets.length === 0) return;

      const attachment = makeDocumentMediaAttachment(result.assets[0]);
      setMediaAttachments((current) => [attachment, ...current]);
      setDraftNotice(`Document attached: ${attachment.filename}`);
    } catch (error) {
      console.error('Document picker failed', error);
      Alert.alert('Document picker failed', 'Unable to attach the selected document.');
    }
  }

  async function handleMediaAction(type: MediaType) {
    if (type === 'photo' || type === 'video') {
      await addCapturedMediaAttachment(type);
      return;
    }

    if (type === 'audio') {
      await startAudioRecording();
      return;
    }

    await attachDocument();
  }

  function removeMediaAttachment(id: string) {
    setMediaAttachments((current) => current.filter((attachment) => attachment.id !== id));
    setDraftNotice('Media attachment removed from this draft.');
  }

  function fileAgainstAssignment(assignment: Assignment) {
    setSelectedAssignmentId(assignment.id);
    setFocusedAssignmentId(assignment.id);
    setActiveTab('capture');
  }

  async function updateAssignment(assignment: Assignment, status: Assignment['status']) {
    try {
      const updated = await api<Assignment>(`/assignments/${assignment.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setAssignments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      Alert.alert('Unable to update assignment', err instanceof Error ? err.message : 'Please try again.');
    }
  }

  function currentReporterLocation() {
    const assignmentLocation = activeAssignments[0]?.location || assignments[0]?.location;
    if (assignmentLocation) {
      return {
        latitude: assignmentLocation.latitude,
        longitude: assignmentLocation.longitude,
        altitude: assignmentLocation.altitude,
        accuracy: assignmentLocation.accuracy || 25,
        timestamp: new Date().toISOString(),
        placeName: assignmentLocation.placeName || 'Assignment location',
      };
    }
    return {
      latitude: 51.5072,
      longitude: -0.1276,
      accuracy: 50,
      timestamp: new Date().toISOString(),
      placeName: user?.bureau || 'Bureau location',
    };
  }

  async function loadSafetyHistory(userId = user?.id) {
    if (!userId) return;
    try {
      const checkIns = await api<SafetyCheckIn[]>(`/safety/history?userId=${userId}`);
      setSafetyHistory(checkIns);
    } catch (err) {
      setSafetyNotice(err instanceof Error ? err.message : 'Unable to refresh safety history.');
    }
  }

  async function sendSafetyCheckIn(status: SafetyStatus = safetyStatus) {
    if (!user) {
      Alert.alert('Profile unavailable', 'Refresh the app before sending a safety check-in.');
      return;
    }
    const location = currentReporterLocation();
    const queuedCheckIn: LocalSafetyCheckIn = {
      id: `local_safe_${Date.now()}`,
      userId: user.id,
      location,
      status,
      message: safetyMessage.trim() || undefined,
      timestamp: new Date().toISOString(),
    };

    setSafetyLoading(true);
    setSafetyNotice(null);
    try {
      const checkIn = await api<SafetyCheckIn>('/safety/checkin', {
        method: 'POST',
        body: JSON.stringify({
          userId: user.id,
          latitude: location.latitude,
          longitude: location.longitude,
          altitude: location.altitude,
          accuracy: location.accuracy,
          status,
          message: safetyMessage.trim() || undefined,
        }),
      });
      setSafetyHistory((current) => [checkIn, ...current]);
      setSafetyNotice(status === 'safe' ? 'Safety check-in sent to the newsroom.' : 'Safety alert shared with the newsroom.');
      setSafetyStatus('safe');
      setSafetyMessage('');
    } catch {
      setLocalSafetyCheckIns((current) => [queuedCheckIn, ...current]);
      setSafetyNotice('Connection unavailable. Safety check-in saved offline and will sync later.');
      setSafetyStatus('safe');
      setSafetyMessage('');
    } finally {
      setSafetyLoading(false);
    }
  }

  async function sendPanicAlert() {
    if (!user) return;
    Alert.alert('Send emergency alert?', 'This PoC will notify the backend safety desk immediately.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send alert',
        style: 'destructive',
        onPress: async () => {
          const location = currentReporterLocation();
          setSafetyLoading(true);
          try {
            const checkIn = await api<SafetyCheckIn>('/safety/panic', {
              method: 'POST',
              body: JSON.stringify({
                userId: user.id,
                latitude: location.latitude,
                longitude: location.longitude,
              }),
            });
            setSafetyHistory((current) => [checkIn, ...current]);
            setSafetyNotice('Emergency alert acknowledged by the newsroom safety desk.');
          } catch (err) {
            Alert.alert('Unable to send emergency alert', err instanceof Error ? err.message : 'Please try again or use emergency contacts.');
          } finally {
            setSafetyLoading(false);
          }
        },
      },
    ]);
  }

  async function submitStory() {
    if (!user) return;
    if (!draftBody.trim() && !draftTitle.trim()) {
      Alert.alert('Nothing to save', 'Add a title or field notes before saving a draft.');
      return;
    }
    const assignmentId = activeAssignments[0]?.id;
    try {
      const summary = await api<{ summary: string; tags: string[]; suggestedTitle: string }>('/ai/summarize', {
        method: 'POST',
        body: JSON.stringify({ title: draftTitle, text: draftBody }),
      }).catch(() => ({ summary: draftBody.slice(0, 160), tags: ['field-report'], suggestedTitle: draftTitle }));

      const story = await api<Story>('/stories', {
        method: 'POST',
        body: JSON.stringify({
          assignmentId,
          authorId: user.id,
          title: summary.suggestedTitle || draftTitle,
          body: draftBody,
          summary: summary.summary,
          tags: summary.tags,
          language: 'en',
          status: 'draft',
        }),
      });
      const uploadedAttachments = await uploadStoryAttachments(mediaAttachments, story.id);
      setStories((current) => [{ ...story, media: uploadedAttachments }, ...current]);
      setDraftTitle('');
      setDraftBody('');
      setMediaAttachments([]);
      const uploadedCount = uploadedAttachments.filter((attachment) => attachment.uploadStatus === 'uploaded').length;
      setDraftNotice(
        uploadedCount > 0
          ? `Draft saved with ${uploadedCount} attachment${uploadedCount === 1 ? '' : 's'} uploaded.`
          : 'Draft saved to the newsroom queue.'
      );
      setActiveTab('offline');
    } catch (err) {
      await saveOfflineDraft(false);
      Alert.alert('Saved offline instead', err instanceof Error ? err.message : 'Backend unavailable. Draft remains on this device.');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>AJ Now Reporter</Text>
          <Text style={styles.title}>Field Desk</Text>
        </View>
        <View style={[styles.livePill, backendStatus === 'offline' && styles.livePillOffline]}>
          <Text style={[styles.liveDot, backendStatus === 'offline' && styles.liveDotOffline]}>●</Text>
          <Text style={styles.liveText}>{backendStatus === 'online' ? 'LIVE SYNC' : backendStatus === 'checking' ? 'CHECKING' : 'OFFLINE'}</Text>
        </View>
      </View>

      <View style={styles.statusPanel}>
        <View style={styles.statusTextGroup}>
          <Text style={styles.statusLabel}>Newsroom API</Text>
          <Text style={[styles.statusValue, backendStatus === 'offline' && styles.statusValueOffline]}>
            {backendMessage}
          </Text>
          {IS_WEB ? <Text style={styles.statusHint}>Expo Web test mode · Admin: {buildServerUrl('/admin')}</Text> : null}
        </View>
        <Pressable onPress={retryBackendConnection} style={styles.statusButton}>
          <Text style={styles.statusButtonText}>Retry</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabBar}
      >
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading assignments and field queue…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Backend unavailable</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.hintText}>Start it with: bun run server</Text>
          <Pressable style={styles.primaryButton} onPress={() => loadData()}>
            <Text style={styles.primaryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
        >
          {activeTab === 'briefing' && (
            <View style={styles.section}>
              <Text style={styles.welcome}>Good evening, {user?.name?.split(' ')[0]}</Text>
              <Text style={styles.subtle}>Your newsroom queue, safety posture, and AI filing tools are ready.</Text>

              <View style={styles.metricsRow}>
                <Metric label="Active" value={activeAssignments.length.toString()} />
                <Metric label="Breaking" value={breakingAssignments.length.toString()} tone="red" />
                <Metric label="Drafts" value={stories.length.toString()} />
                <Metric label="Offline" value={localDrafts.length.toString()} tone={localDrafts.length > 0 ? 'red' : undefined} />
                <Metric label="Check-ins" value={safetyHistory.length.toString()} />
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Priority brief</Text>
                {breakingAssignments.length === 0 ? (
                  <Text style={styles.subtle}>No urgent assignments right now.</Text>
                ) : (
                  breakingAssignments.map((assignment) => <AssignmentCard key={assignment.id} assignment={assignment} compact />)
                )}
              </View>

              <View style={styles.cardDark}>
                <Text style={styles.cardTitleLight}>AI assistant suggestions</Text>
                <Text style={styles.lightBody}>• Capture video, audio, and notes together for richer summaries.</Text>
                <Text style={styles.lightBody}>• Use offline drafts when connectivity drops; sync queue preserves evidence trail.</Text>
                <Text style={styles.lightBody}>• Add location metadata only when safe for publication.</Text>
              </View>
            </View>
          )}

          {activeTab === 'assignments' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Assignments</Text>
              <Text style={styles.subtle}>Accept work, update status, and file against newsroom briefs.</Text>
              {assignments.map((assignment) => (
                <AssignmentCard
                  key={assignment.id}
                  assignment={assignment}
                  isFocused={assignment.id === focusedAssignmentId}
                  onAccept={() => updateAssignment(assignment, 'accepted')}
                  onStart={() => updateAssignment(assignment, 'in_progress')}
                  onView={() => openAssignmentDetail(assignment)}
                />
              ))}
              {focusedAssignment && (
                <View style={styles.detailCard}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.assignmentTitle}>Assignment detail</Text>
                    <View style={[styles.statusPill, styles.assignmentStatusPill]}>
                      <Text style={styles.statusText}>{focusedAssignment.status.replace('_', ' ')}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardTitle}>{focusedAssignment.title}</Text>
                  <Text style={styles.assignmentBody}>{focusedAssignment.description}</Text>
                  <View style={styles.detailGrid}>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Bureau</Text>
                      <Text style={styles.detailValue}>{focusedAssignment.bureau}</Text>
                    </View>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Priority</Text>
                      <Text style={styles.detailValue}>{focusedAssignment.priority.toUpperCase()}</Text>
                    </View>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Due</Text>
                      <Text style={styles.detailValue}>{formatTime(focusedAssignment.deadline)}</Text>
                    </View>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Location</Text>
                      <Text style={styles.detailValue}>{formatAssignmentLocation(focusedAssignment)}</Text>
                    </View>
                  </View>
                  <Text style={styles.assignmentMeta}>Last updated {formatTime(focusedAssignment.updatedAt)}</Text>
                  <View style={styles.actionRow}>
                    <Pressable style={styles.secondaryButtonSmall} onPress={() => updateAssignment(focusedAssignment, 'accepted')}>
                      <Text style={styles.secondaryButtonText}>Accept</Text>
                    </Pressable>
                    <Pressable style={styles.primaryButtonSmall} onPress={() => updateAssignment(focusedAssignment, 'in_progress')}>
                      <Text style={styles.primaryButtonText}>Start</Text>
                    </Pressable>
                    <Pressable style={styles.primaryButtonSmall} onPress={() => fileAgainstAssignment(focusedAssignment)}>
                      <Text style={styles.primaryButtonText}>File story</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          )}

          {activeTab === 'capture' && (
            <View style={styles.section}>
              <View style={styles.captureHero}>
                <View style={styles.captureHeroGlow} />
                <Text style={styles.heroEyebrow}>Field filing</Text>
                <Text style={styles.heroTitle}>Shape the story while it is still warm.</Text>
                <Text style={styles.heroBody}>
                  Link the assignment, capture the facts, attach the proof, and keep moving.
                </Text>
                <View style={styles.heroStatsRow}>
                  <View style={styles.heroStatPill}>
                    <Text style={styles.heroStatValue}>{mediaAttachments.length}</Text>
                    <Text style={styles.heroStatLabel}>media</Text>
                  </View>
                  <View style={styles.heroStatPill}>
                    <Text style={styles.heroStatValue}>{localDrafts.length}</Text>
                    <Text style={styles.heroStatLabel}>queued</Text>
                  </View>
                  <View style={styles.heroStatPill}>
                    <Text style={styles.heroStatValue}>{selectedAssignment ? '1' : '0'}</Text>
                    <Text style={styles.heroStatLabel}>linked</Text>
                  </View>
                </View>
              </View>

              <View style={styles.cardSoft}>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>Assignment link</Text>
                    <Text style={styles.microcopy}>Keep the desk context attached from the first note.</Text>
                  </View>
                  <Text style={styles.badge}>{activeAssignments.length} active</Text>
                </View>
                {activeAssignments.length === 0 ? (
                  <Text style={styles.emptyState}>No active assignments are available. You can still file an unassigned draft.</Text>
                ) : (
                  <View style={styles.assignmentPickerList}>
                    {activeAssignments.map((assignment) => {
                      const isSelected = assignment.id === selectedAssignmentId;
                      return (
                        <Pressable
                          key={assignment.id}
                          style={[styles.assignmentOption, isSelected && styles.assignmentOptionSelected]}
                          onPress={() => setSelectedAssignmentId(assignment.id)}
                          onLongPress={() => openAssignmentDetail(assignment)}
                        >
                          <View style={styles.assignmentOptionTopRow}>
                            <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                              {isSelected && <View style={styles.radioInner} />}
                            </View>
                            <View style={styles.assignmentOptionContent}>
                              <Text style={styles.assignmentOptionTitle}>{assignment.title}</Text>
                              <Text style={styles.assignmentOptionMeta}>
                                {assignment.bureau} · {assignment.priority} priority · due {formatTime(assignment.deadline)}
                              </Text>
                            </View>
                            <Pressable style={styles.ghostPill} onPress={() => openAssignmentDetail(assignment)}>
                              <Text style={styles.ghostPillText}>Details</Text>
                            </Pressable>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
                <Pressable
                  style={[styles.assignmentOption, !selectedAssignmentId && styles.assignmentOptionSelected, styles.unassignedOption]}
                  onPress={() => setSelectedAssignmentId(null)}
                >
                  <View style={styles.assignmentOptionTopRow}>
                    <View style={[styles.radioOuter, !selectedAssignmentId && styles.radioOuterSelected]}>
                      {!selectedAssignmentId && <View style={styles.radioInner} />}
                    </View>
                    <View style={styles.assignmentOptionContent}>
                      <Text style={styles.assignmentOptionTitle}>File without assignment</Text>
                      <Text style={styles.assignmentOptionMeta}>Use this for breaking tips or desk-directed work.</Text>
                    </View>
                  </View>
                </Pressable>
              </View>

              <View style={styles.cardSoft}>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>Story draft</Text>
                    <Text style={styles.microcopy}>A calm writing surface for fast field notes.</Text>
                  </View>
                  {selectedAssignment && <Text style={styles.softBadge}>Linked</Text>}
                </View>
                <TextInput
                  value={draftTitle}
                  onChangeText={setDraftTitle}
                  placeholder="Headline"
                  placeholderTextColor="#94A3B8"
                  style={[styles.input, styles.titleInput]}
                />
                <TextInput
                  value={draftBody}
                  onChangeText={setDraftBody}
                  placeholder="What happened? Add context, quotes, names, and what the desk should verify next."
                  placeholderTextColor="#94A3B8"
                  multiline
                  style={[styles.input, styles.textArea]}
                />
              </View>

              <View style={styles.mediaCloudCard}>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>Media cloud</Text>
                    <Text style={styles.microcopy}>Capture evidence gently, then keep every file close to the draft.</Text>
                  </View>
                  <Text style={styles.badge}>{mediaAttachments.length} attached</Text>
                </View>
                <View style={styles.attachmentToolbar}>
                  {Object.entries(mediaTypeIcons).map(([type, icon]) => (
                    <Pressable key={type} style={styles.attachmentButton} onPress={() => handleMediaAction(type as MediaType)}>
                      <Text style={styles.attachmentIcon}>{icon}</Text>
                      <Text style={styles.attachmentButtonText}>{mediaTypeLabels[type as MediaType]}</Text>
                    </Pressable>
                  ))}
                </View>
                {mediaAttachments.length === 0 ? (
                  <View style={styles.attachmentEmptyState}>
                    <Text style={styles.attachmentEmptyIcon}>☁️</Text>
                    <Text style={styles.attachmentEmptyTitle}>No media attached yet</Text>
                    <Text style={styles.attachmentEmptyText}>Add a photo, clip, voice note, or document when the story needs it.</Text>
                  </View>
                ) : (
                  <View style={styles.attachmentList}>
                    {mediaAttachments.map((attachment) => (
                      <View key={attachment.id} style={styles.attachmentCard}>
                        <View style={styles.attachmentThumb}>
                          <Text style={styles.attachmentThumbText}>{mediaTypeIcons[attachment.type]}</Text>
                        </View>
                        <View style={styles.attachmentInfo}>
                          <Text style={styles.attachmentName}>{attachment.filename}</Text>
                          <Text style={styles.attachmentMeta}>
                            {attachment.type} · {formatBytes(attachment.sizeBytes)} · {attachment.uploadStatus}
                          </Text>
                        </View>
                        <Pressable onPress={() => removeMediaAttachment(attachment.id)} style={styles.removeAttachmentButton}>
                          <Text style={styles.removeAttachmentText}>Remove</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.captureActions}>
                <Pressable style={styles.secondaryButton} onPress={() => saveOfflineDraft()}>
                  <Text style={styles.secondaryButtonText}>Save offline</Text>
                </Pressable>
                <Pressable style={styles.primaryButton} onPress={submitStory}>
                  <Text style={styles.primaryButtonText}>Submit to desk</Text>
                </Pressable>
              </View>
            </View>
          )}

          {activeTab === 'safety' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Safety desk</Text>
              <Text style={styles.subtle}>Fast check-ins for high-pressure field work. This PoC uses assignment/bureau coordinates so the workflow can be tested without device permissions.</Text>
              {safetyNotice && <Text style={styles.noticeText}>{safetyNotice}</Text>}

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Send check-in</Text>
                <Text style={styles.inputLabel}>Status</Text>
                <View style={styles.statusRow}>
                  {(['safe', 'alert'] as SafetyStatus[]).map((status) => (
                    <Pressable
                      key={status}
                      style={[styles.statusOption, safetyStatus === status && styles.statusOptionActive]}
                      onPress={() => setSafetyStatus(status)}
                    >
                      <Text style={[styles.statusOptionText, safetyStatus === status && styles.statusOptionTextActive]}>{status === 'safe' ? 'Safe' : 'Needs attention'}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.inputLabel}>Message</Text>
                <TextInput
                  value={safetyMessage}
                  onChangeText={setSafetyMessage}
                  style={[styles.input, styles.textAreaSmall]}
                  placeholder="Short note for the safety desk"
                  multiline
                />
                <View style={styles.buttonStack}>
                  <Pressable style={styles.primaryButton} onPress={() => sendSafetyCheckIn()} disabled={safetyLoading}>
                    <Text style={styles.primaryButtonText}>{safetyLoading ? 'Sending…' : 'Send check-in'}</Text>
                  </Pressable>
                  <Pressable style={styles.dangerButton} onPress={sendPanicAlert} disabled={safetyLoading}>
                    <Text style={styles.dangerButtonText}>Emergency alert</Text>
                  </Pressable>
                </View>
              </View>

              {localSafetyCheckIns.length > 0 ? (
                <View style={styles.queueGroup}>
                  <Text style={styles.sectionTitle}>Queued offline safety check-ins</Text>
                  {localSafetyCheckIns.map((checkIn) => (
                    <View key={checkIn.id} style={styles.card}>
                      <View style={styles.cardHeaderRow}>
                        <View>
                          <Text style={styles.cardTitle}>
                            {checkIn.status === 'syncing' ? 'Syncing' : checkIn.status === 'safe' ? 'Safe' : 'Needs attention'}
                          </Text>
                          <Text style={styles.assignmentMeta}>{new Date(checkIn.timestamp).toLocaleString()}</Text>
                        </View>
                        <Text style={styles.badge}>Offline</Text>
                      </View>
                      <Text style={styles.assignmentBody}>{checkIn.message || 'No message provided.'}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.queueGroup}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardTitle}>Recent check-ins</Text>
                  <Pressable onPress={() => loadSafetyHistory()} disabled={safetyLoading}>
                    <Text style={styles.linkText}>Refresh</Text>
                  </Pressable>
                </View>
                {safetyHistory.length === 0 ? (
                  <View style={styles.card}><Text style={styles.subtle}>No safety check-ins yet.</Text></View>
                ) : (
                  safetyHistory.map((checkIn) => <SafetyCheckInCard key={checkIn.id} checkIn={checkIn} />)
                )}
              </View>
            </View>
          )}

          {activeTab === 'profile' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Correspondent profile</Text>
              <View style={styles.card}>
                <Text style={styles.profileName}>{user?.name}</Text>
                <Text style={styles.subtle}>{user?.email}</Text>
                <Text style={styles.profileMeta}>Bureau: {user?.bureau}</Text>
                <Text style={styles.profileMeta}>Role: {user?.role}</Text>
                <View style={styles.divider} />
                <Text style={styles.cardTitle}>Safety check-in</Text>
                <Text style={styles.subtle}>Location sharing and emergency contact workflows are represented in the backend safety API.</Text>
                <Pressable style={styles.secondaryButton} onPress={() => setActiveTab('safety')}>
                  <Text style={styles.secondaryButtonText}>Open safety desk</Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'red' }) {
  return (
    <View style={styles.metricCard}>
      <Text style={[styles.metricValue, tone === 'red' && styles.metricRed]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function AssignmentCard({
  assignment,
  compact,
  isFocused,
  onAccept,
  onStart,
  onView,
}: {
  assignment: Assignment;
  compact?: boolean;
  isFocused?: boolean;
  onAccept?: () => void;
  onStart?: () => void;
  onView?: () => void;
}) {
  return (
    <View style={[styles.assignmentCard, isFocused && styles.assignmentCardFocused]}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.assignmentTitle}>{assignment.title}</Text>
        <View style={[styles.priorityPill, { backgroundColor: priorityColor[assignment.priority] || '#64748B' }]}>
          <Text style={styles.priorityText}>{assignment.priority.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.assignmentBody}>{assignment.description}</Text>
      <Text style={styles.assignmentMeta}>Due {formatTime(assignment.deadline)} · {assignment.bureau}</Text>
      {!compact && (
        <View style={styles.actionRow}>
          <Pressable style={styles.secondaryButtonSmall} onPress={onView}>
            <Text style={styles.secondaryButtonText}>Details</Text>
          </Pressable>
          <Pressable style={styles.secondaryButtonSmall} onPress={onAccept}>
            <Text style={styles.secondaryButtonText}>Accept</Text>
          </Pressable>
          <Pressable style={styles.primaryButtonSmall} onPress={onStart}>
            <Text style={styles.primaryButtonText}>Start</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function SafetyCheckInCard({ checkIn }: { checkIn: SafetyCheckIn }) {
  const isEmergency = checkIn.status === 'emergency' || checkIn.status === 'alert';
  return (
    <View style={[styles.card, isEmergency && styles.alertCard]}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.assignmentTitle}>{checkIn.status === 'safe' ? 'Safe check-in' : 'Safety alert'}</Text>
        <View style={[styles.statusPill, isEmergency && styles.alertPill]}><Text style={styles.statusText}>{checkIn.status}</Text></View>
      </View>
      {checkIn.message && <Text style={styles.assignmentBody}>{checkIn.message}</Text>}
      <Text style={styles.assignmentMeta}>
        {formatTime(checkIn.timestamp)} · {checkIn.location.placeName || `${checkIn.location.latitude.toFixed(2)}, ${checkIn.location.longitude.toFixed(2)}`}
      </Text>
    </View>
  );
}


const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#050505' },
  header: {
    backgroundColor: '#050505',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase' },
  title: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', marginTop: 2 },
  livePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#102A1E', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  liveDot: { color: '#22C55E', marginRight: 5, fontSize: 10 },
  liveText: { color: '#BBF7D0', fontSize: 11, fontWeight: '800' },
  tabBar: { backgroundColor: '#050505', paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: '#171717', borderWidth: 1, borderColor: '#2A2A2A' },
  tabActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  tabText: { color: '#D4D4D4', fontWeight: '700' },
  tabTextActive: { color: '#111111' },
  content: { flex: 1, backgroundColor: '#F5F1E8' },
  section: { padding: spacing.lg, gap: spacing.md },
  captureHero: {
    backgroundColor: cloud.sky,
    borderColor: '#D8ECFF',
    borderRadius: 30,
    borderWidth: 1,
    overflow: 'hidden',
    padding: spacing.lg,
    position: 'relative',
    ...softShadow,
  },
  captureHeroGlow: {
    backgroundColor: '#D7F0FF',
    borderRadius: 999,
    height: 180,
    opacity: 0.72,
    position: 'absolute',
    right: -54,
    top: -78,
    width: 180,
  },
  heroEyebrow: {
    color: cloud.blueDark,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: cloud.ink,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.7,
    lineHeight: 33,
    maxWidth: 360,
  },
  heroBody: {
    color: cloud.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.sm,
    maxWidth: 420,
  },
  heroStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  heroStatPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: '#DCEFFF',
    borderRadius: 18,
    borderWidth: 1,
    minWidth: 82,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  heroStatValue: {
    color: cloud.ink,
    fontSize: 20,
    fontWeight: '900',
  },
  heroStatLabel: {
    color: cloud.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  cardSoft: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderColor: cloud.line,
    borderRadius: 26,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
    ...softShadow,
  },
  mediaCloudCard: {
    backgroundColor: '#F8FCFF',
    borderColor: '#DCEFFF',
    borderRadius: 28,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
    ...softShadow,
  },
  microcopy: {
    color: cloud.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  softBadge: {
    backgroundColor: cloud.mint,
    borderRadius: 999,
    color: '#047857',
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 6,
    textTransform: 'uppercase',
  },
  centered: { flex: 1, backgroundColor: '#F5F1E8', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  loadingText: { marginTop: 12, color: '#44403C', fontWeight: '700' },
  errorTitle: { fontSize: 22, fontWeight: '900', color: '#111827', marginBottom: 8 },
  errorText: { textAlign: 'center', color: '#7F1D1D', marginBottom: 8 },
  hintText: { color: '#57534E', fontFamily: 'Courier', marginBottom: 16 },
  welcome: { fontSize: 28, fontWeight: '900', color: '#111827' },
  sectionTitle: { fontSize: 26, fontWeight: '900', color: '#111827' },
  subtle: { color: '#57534E', fontSize: 15, lineHeight: 22 },
  noticeText: { color: '#7C2D12', backgroundColor: '#FFEDD5', borderRadius: 14, padding: 12, fontWeight: '800', lineHeight: 20 },
  hintSmall: { color: '#78716C', fontSize: 12, lineHeight: 18, marginTop: 2 },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metricCard: { flexGrow: 1, flexBasis: '47%', backgroundColor: '#FFFFFF', borderRadius: 18, padding: spacing.md, borderWidth: 1, borderColor: '#E7E0D1' },
  metricValue: { fontSize: 30, fontWeight: '900', color: '#111827' },
  metricRed: { color: '#E31B23' },
  metricLabel: { color: '#78716C', fontWeight: '800', textTransform: 'uppercase', fontSize: 11 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: spacing.md, borderWidth: 1, borderColor: '#E7E0D1', gap: 12 },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  badge: {
    backgroundColor: colors.brandLight,
    borderRadius: 999,
    color: colors.brand,
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 5,
    textTransform: 'uppercase',
  },
  emptyState: {
    backgroundColor: '#F5F5F5',
    borderRadius: 14,
    color: colors.gray600,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  assignmentPickerList: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  assignmentOption: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E0ECF8',
    borderRadius: 20,
    borderWidth: 1,
    padding: spacing.md,
  },
  assignmentOptionSelected: {
    backgroundColor: cloud.blueSoft,
    borderColor: cloud.blue,
  },
  assignmentOptionTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  assignmentOptionContent: {
    flex: 1,
  },
  assignmentOptionTitle: {
    color: cloud.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  assignmentOptionTitleSelected: {
    color: colors.brand,
  },
  assignmentOptionMeta: {
    color: cloud.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  assignmentOptionCheck: {
    color: colors.gray600,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  assignmentOptionCheckSelected: {
    color: colors.brand,
  },
  assignmentLinkNotice: {
    color: colors.brand,
    fontSize: 13,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  assignmentOptionActions: { alignItems: 'flex-end', gap: 6 },
  inlineLinkButton: { paddingHorizontal: 4, paddingVertical: 2 },
  inlineLinkText: { color: colors.brand, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  radioOuter: {
    alignItems: 'center',
    borderColor: '#B6D7F5',
    borderRadius: 999,
    borderWidth: 2,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  radioOuterSelected: {
    borderColor: cloud.blueDark,
  },
  radioInner: {
    backgroundColor: cloud.blueDark,
    borderRadius: 999,
    height: 10,
    width: 10,
  },
  ghostPill: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D6E7F8',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ghostPillText: {
    color: cloud.blueDark,
    fontSize: 12,
    fontWeight: '900',
  },
  unassignedOption: {
    marginTop: spacing.xs,
  },
  detailCard: { backgroundColor: '#FFFCF7', borderRadius: 22, padding: spacing.md, borderWidth: 1, borderColor: colors.brand, gap: 12 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  detailItem: { flexBasis: '47%', flexGrow: 1, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E7E0D1', padding: spacing.sm },
  detailLabel: { color: colors.gray600, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  detailValue: { color: colors.gray900, fontSize: 14, fontWeight: '800', marginTop: 3 },
  assignmentStatusPill: { backgroundColor: colors.brandLight },
  cardDark: { backgroundColor: '#111111', borderRadius: 22, padding: spacing.md, gap: 8 },
  cardTitle: { fontSize: 18, fontWeight: '900', color: '#111827' },
  cardTitleLight: { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },
  lightBody: { color: '#E7E5E4', lineHeight: 22 },
  assignmentCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: spacing.md, borderWidth: 1, borderColor: '#E7E0D1', gap: 10 },
  assignmentCardFocused: { borderColor: colors.brand, borderWidth: 2, backgroundColor: '#FFFCF7' },
  offlineCard: { backgroundColor: '#FFFCF7', borderRadius: 18, padding: spacing.md, borderWidth: 1, borderColor: '#FDBA74', gap: 10 },
  queueGroup: { gap: spacing.sm },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  assignmentTitle: { flex: 1, fontSize: 17, fontWeight: '900', color: '#111827' },
  assignmentBody: { color: '#44403C', lineHeight: 21 },
  assignmentMeta: { color: '#78716C', fontSize: 12, fontWeight: '700' },
  priorityPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  priorityText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  statusPill: { backgroundColor: '#EEF2FF', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  statusText: { color: '#3730A3', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  alertCard: { borderColor: '#F97316', backgroundColor: '#FFF7ED' },
  alertPill: { backgroundColor: '#FED7AA' },
  offlinePill: { backgroundColor: '#FFF7ED', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: '#FDBA74' },
  offlinePillText: { color: '#9A3412', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 4 },
  primaryButton: { backgroundColor: '#111111', borderRadius: 14, alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  primaryButtonSmall: { backgroundColor: '#111111', borderRadius: 12, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '900' },
  buttonStack: { gap: spacing.sm, marginTop: 4 },
  statusRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statusOption: { borderRadius: 999, borderWidth: 1, borderColor: '#D6D3D1', paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#FAFAFA' },
  statusOptionActive: { borderColor: colors.accent, backgroundColor: '#FFF7CC' },
  statusOptionText: { color: '#57534E', fontWeight: '800' },
  statusOptionTextActive: { color: '#111827' },
  secondaryButton: { borderColor: '#111111', borderWidth: 1, borderRadius: 14, alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  secondaryButtonSmall: { borderColor: '#111111', borderWidth: 1, borderRadius: 12, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  secondaryButtonText: { color: '#111111', fontWeight: '900' },
  inputLabel: { color: '#44403C', fontWeight: '900', fontSize: 12, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: '#D6D3D1', borderRadius: 14, padding: 12, fontSize: 16, color: '#111827', backgroundColor: '#FFFCF7' },
  textArea: { minHeight: 130, textAlignVertical: 'top' },
  textAreaSmall: { minHeight: 88, textAlignVertical: 'top' },
  captureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  captureActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  captureAction: { width: '48%', borderRadius: 16, borderWidth: 1, borderColor: '#E7E0D1', padding: spacing.md, backgroundColor: '#FFFCF7', gap: 4 },
  captureIcon: { fontSize: 22 },
  captureLabel: { fontSize: 16, fontWeight: '900', color: '#111827' },
  captureDetail: { color: '#78716C', marginTop: 2 },
  mediaPanel: { backgroundColor: '#FFFCF7', borderRadius: 18, borderWidth: 1, borderColor: '#E7E0D1', padding: spacing.md, gap: spacing.sm },
  disabledAction: { opacity: 0.55 },
  recordingBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: 16, backgroundColor: '#FDECEC', borderWidth: 1, borderColor: '#F1B6B6' },
  recordingIcon: { color: colors.breaking, fontSize: 18, fontWeight: '800' },
  recordingTextBlock: { flex: 1 },
  recordingTitle: { fontWeight: '800', color: colors.breaking },
  recordingDetail: { color: '#7A2D2D', fontSize: 12 },
  mediaPanelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  mediaPanelTitleBlock: { flex: 1 },
  attachmentCountPill: { minWidth: 34, height: 34, borderRadius: 17, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  attachmentCountText: { color: '#111827', fontWeight: '900' },
  emptyStateText: { color: '#78716C', fontSize: 13, lineHeight: 18 },
  attachmentList: { gap: spacing.sm },
  attachmentItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E7E0D1', padding: spacing.sm },
  attachmentCard: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#DCEBFA', borderRadius: 22, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  attachmentThumb: { alignItems: 'center', backgroundColor: cloud.blueSoft, borderRadius: 18, height: 46, justifyContent: 'center', width: 46 },
  attachmentThumbText: { fontSize: 22 },
  attachmentIconBubble: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F5EFE2', alignItems: 'center', justifyContent: 'center' },
  attachmentIcon: { fontSize: 22 },
  attachmentInfo: { flex: 1 },
  attachmentMeta: { color: cloud.muted, fontSize: 12, marginTop: 3, textTransform: 'capitalize' },
  attachmentName: { color: cloud.ink, fontSize: 14, fontWeight: '900' },
  attachmentDetails: { color: '#78716C', fontSize: 12, marginTop: 2 },
  removeAttachmentButton: { backgroundColor: '#FFF7F7', borderColor: '#F5C2C2', borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  removeAttachmentText: { color: colors.error, fontSize: 12, fontWeight: '900' },
  titleInput: {
    fontSize: 18,
    fontWeight: '800',
  },
  attachmentToolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  attachmentButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#DCEBFA',
    borderRadius: 20,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    gap: 6,
    justifyContent: 'center',
    minHeight: 84,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  attachmentButtonText: {
    color: cloud.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  attachmentEmptyState: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#DCEBFA',
    borderRadius: 24,
    borderStyle: 'dashed',
    borderWidth: 1,
    padding: spacing.lg,
  },
  attachmentEmptyIcon: { fontSize: 34, marginBottom: spacing.xs },
  attachmentEmptyTitle: { color: cloud.ink, fontSize: 16, fontWeight: '900' },
  attachmentEmptyText: { color: cloud.muted, fontSize: 13, lineHeight: 19, marginTop: 4, maxWidth: 280, textAlign: 'center' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { color: '#7C2D12', backgroundColor: '#FFEDD5', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: '700' },
  dangerButton: { backgroundColor: '#B91C1C', borderRadius: 14, alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  dangerButtonText: { color: '#FFFFFF', fontWeight: '900' },
  linkText: { color: '#9A7B00', fontWeight: '900' },
  profileName: { fontSize: 24, fontWeight: '900', color: '#111827' },
  profileMeta: { color: '#44403C', fontSize: 16, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#E7E0D1', marginVertical: 4 },

  livePillOffline: {
    backgroundColor: '#7F1D1D',
  },
  liveDotOffline: {
    color: '#FCA5A5',
  },
  statusPanel: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusTextGroup: {
    flex: 1,
  },
  statusLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '800',
  },
  statusValue: {
    color: '#DCFCE7',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  statusValueOffline: {
    color: '#FECACA',
  },
  statusHint: {
    color: '#93C5FD',
    fontSize: 11,
    marginTop: 4,
  },
  statusButton: {
    backgroundColor: '#1D4ED8',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  statusButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  testPanel: {
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  testTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1D4ED8',
    marginBottom: 4,
  },
  testText: {
    color: '#334155',
    lineHeight: 19,
    marginBottom: spacing.sm,
  },
  inlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  uploadStatusRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  uploadStatusBadge: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#FEF3C7',
    color: '#92400E',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  uploadStatusBadgeUploaded: {
    backgroundColor: '#DCFCE7',
    color: '#166534',
  },
  uploadStatusBadgeUploading: {
    backgroundColor: '#DBEAFE',
    color: '#1D4ED8',
  },
  uploadStatusBadgeFailed: {
    backgroundColor: '#FEE2E2',
    color: '#991B1B',
  },

});
