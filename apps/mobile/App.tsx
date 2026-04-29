import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
type TabKey = 'briefing' | 'assignments' | 'capture' | 'offline' | 'safety' | 'profile';

const API_BASE = 'http://localhost:3001/api';
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

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
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
  const [syncingDraftId, setSyncingDraftId] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [focusedAssignmentId, setFocusedAssignmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  async function loadData(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setError(null);
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
      setSelectedAssignmentId((current) => {
        if (current && assignmentData.some((assignment) => assignment.id === current)) return current;
        const nextActiveAssignment = assignmentData.find(
          (assignment) => assignment.status !== 'filed' && assignment.status !== 'published'
        );
        return nextActiveAssignment?.id ?? null;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load Reporter App data';
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

  async function syncLocalDraft(draft: LocalDraft) {
    if (!user) {
      Alert.alert('Profile unavailable', 'Refresh the app before syncing local drafts.');
      return;
    }
    setSyncingDraftId(draft.id);
    setLocalDrafts((current) => current.map((item) => (item.id === draft.id ? { ...item, status: 'syncing' } : item)));
    try {
      const response = await pushSyncItems([localDraftToSyncItem(draft)]);
      const result = response.results.find((item) => item.id === draft.id);
      if (!result || result.status !== 'accepted') {
        throw new Error(result?.error || 'Draft was not accepted by the sync endpoint.');
      }
      setLocalDrafts((current) => current.filter((item) => item.id !== draft.id));
      setDraftNotice('Offline draft synced to the newsroom draft queue.');
      loadData(false);
    } catch (err) {
      setLocalDrafts((current) => current.map((item) => (item.id === draft.id ? { ...item, status: 'queued' } : item)));
      Alert.alert('Unable to sync draft', err instanceof Error ? err.message : 'Draft remains safely queued offline.');
    } finally {
      setSyncingDraftId(null);
    }
  }

  async function syncQueuedItems() {
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
      setDraftNotice(`Synced ${response.accepted} offline item${response.accepted === 1 ? '' : 's'} to the newsroom.`);
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
      Alert.alert('Unable to sync offline items', err instanceof Error ? err.message : 'Items remain safely queued offline.');
    }
  }

  function discardLocalDraft(draft: LocalDraft) {
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
    const result = await ImagePicker.requestCameraPermissionsAsync();
    if (!result.granted) {
      Alert.alert('Camera access needed', 'Enable camera permissions to capture photos and videos for this story.');
      return false;
    }

    return true;
  }

  async function ensureMicrophonePermission() {
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
      const result = await ImagePicker.launchCameraAsync({
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
      setDraftNotice(`${mediaTypeLabels[type]} captured and attached to this draft.`);
    } catch (error) {
      console.error(`Failed to capture ${type}`, error);
      Alert.alert('Capture failed', `Could not capture ${mediaTypeLabels[type].toLowerCase()}. Please try again.`);
    } finally {
      setIsCapturingMedia(null);
    }
  }

  async function addLibraryMediaAttachment(type: Extract<MediaType, 'photo' | 'video'>) {
    if (isCapturingMedia) return;

    setIsCapturingMedia(type);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: type === 'photo' ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: type === 'photo' ? 0.82 : 1,
      });

      if (result.canceled || !result.assets.length) {
        setDraftNotice(`${mediaTypeLabels[type]} selection cancelled.`);
        return;
      }

      setMediaAttachments((current) => [makePickerMediaAttachment(type, result.assets[0]), ...current]);
      setDraftNotice(`${mediaTypeLabels[type]} selected and attached to this draft.`);
    } catch (error) {
      console.error(`Failed to select ${type}`, error);
      Alert.alert('Selection failed', `Could not select ${mediaTypeLabels[type].toLowerCase()}. Please try again.`);
    } finally {
      setIsCapturingMedia(null);
    }
  }

  async function startAudioRecording() {
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

  async function stopAudioRecording() {
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

  async function handleMediaAction(type: MediaType) {
    if (type === 'photo' || type === 'video') {
      await addCapturedMediaAttachment(type);
      return;
    }

    if (type === 'audio') {
      await startAudioRecording();
      return;
    }

    Alert.alert('Document picker next', 'Photo, video, and audio capture are live now. File/document picking needs the Expo document picker module in the next increment.');
    setDraftNotice('Document picker is queued for the next media increment.');
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
      setStories((current) => [story, ...current]);
      setDraftTitle('');
      setDraftBody('');
      setDraftNotice('Draft saved to the newsroom queue.');
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
        <View style={styles.livePill}>
          <Text style={styles.liveDot}>●</Text>
          <Text style={styles.liveText}>LIVE SYNC</Text>
        </View>
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
              <View style={styles.card}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Assignment link</Text>
                  <Text style={styles.badge}>{activeAssignments.length} active</Text>
                </View>
                <Text style={styles.subtle}>Choose the assignment this story belongs to before saving or submitting.</Text>
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
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.assignmentOptionTitle, isSelected && styles.assignmentOptionTitleSelected]}>
                              {assignment.title}
                            </Text>
                            <Text style={styles.assignmentOptionMeta}>
                              {assignment.bureau} • {assignment.priority.toUpperCase()} • due {formatTime(assignment.deadline ?? assignment.updatedAt)}
                            </Text>
                          </View>
                          <View style={styles.assignmentOptionActions}>
                            <Text style={[styles.assignmentOptionCheck, isSelected && styles.assignmentOptionCheckSelected]}>
                              {isSelected ? 'Selected' : 'Select'}
                            </Text>
                            <Pressable style={styles.inlineLinkButton} onPress={() => openAssignmentDetail(assignment)}>
                              <Text style={styles.inlineLinkText}>Details</Text>
                            </Pressable>
                          </View>
                        </Pressable>
                      );
                    })}
                    <Pressable
                      style={[styles.assignmentOption, selectedAssignmentId === null && styles.assignmentOptionSelected]}
                      onPress={() => setSelectedAssignmentId(null)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.assignmentOptionTitle, selectedAssignmentId === null && styles.assignmentOptionTitleSelected]}>
                          File without assignment
                        </Text>
                        <Text style={styles.assignmentOptionMeta}>Use for tips, unscheduled updates, or field notes.</Text>
                      </View>
                      <Text style={[styles.assignmentOptionCheck, selectedAssignmentId === null && styles.assignmentOptionCheckSelected]}>
                        {selectedAssignmentId === null ? 'Selected' : 'Select'}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>

              <Text style={styles.sectionTitle}>Story capture</Text>
              <Text style={styles.subtle}>PoC draft composer with AI summary/tag simulation through the backend.</Text>
              <Text style={styles.assignmentLinkNotice}>
                {selectedAssignment ? `Linked to: ${selectedAssignment.title}` : 'No assignment selected'}
              </Text>
              {draftNotice && <Text style={styles.noticeText}>{draftNotice}</Text>}
              <View style={styles.card}>
                <Text style={styles.inputLabel}>Story title</Text>
                <TextInput value={draftTitle} onChangeText={setDraftTitle} style={styles.input} placeholder="Working headline" />
                <Text style={styles.inputLabel}>Field notes / transcript</Text>
                <TextInput
                  value={draftBody}
                  onChangeText={setDraftBody}
                  style={[styles.input, styles.textArea]}
                  placeholder="Type notes, pasted transcript, or summary from an interview…"
                  multiline
                />
                {audioRecording ? (
                  <Pressable style={styles.recordingBanner} onPress={stopAudioRecording}>
                    <Text style={styles.recordingIcon}>●</Text>
                    <View style={styles.recordingTextBlock}>
                      <Text style={styles.recordingTitle}>Recording audio</Text>
                      <Text style={styles.recordingDetail}>Tap to stop and attach this recording</Text>
                    </View>
                  </Pressable>
                ) : null}
                <View style={styles.captureGrid}>
                  {(Object.keys(mediaTypeLabels) as MediaType[]).map((type) => (
                    <Pressable
                      key={type}
                      style={[styles.captureAction, isCapturingMedia ? styles.disabledAction : null]}
                      onPress={() => handleMediaAction(type)}
                      disabled={Boolean(isCapturingMedia)}
                    >
                      <Text style={styles.captureIcon}>{mediaTypeIcons[type]}</Text>
                      <Text style={styles.captureLabel}>{type === 'audio' ? 'Record' : type === 'document' ? 'Pick' : 'Capture'} {mediaTypeLabels[type]}</Text>
                      <Text style={styles.captureDetail}>
                        {type === 'photo'
                          ? 'Launch camera'
                          : type === 'video'
                            ? 'Launch video recorder'
                            : type === 'audio'
                              ? 'Use microphone'
                              : 'Picker next'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.mediaPanel}>
                  <View style={styles.mediaPanelHeader}>
                    <View style={styles.mediaPanelTitleBlock}>
                      <Text style={styles.cardTitle}>Media attachments</Text>
                      <Text style={styles.subtle}>Attachments stay with the draft, including when saved offline.</Text>
                    </View>
                    <View style={styles.attachmentCountPill}>
                      <Text style={styles.attachmentCountText}>{mediaAttachments.length}</Text>
                    </View>
                  </View>

                  {mediaAttachments.length === 0 ? (
                    <Text style={styles.emptyStateText}>No media attached yet. Use the buttons above to capture photos, record video or audio, or choose existing media for this draft.</Text>
                  ) : (
                    <View style={styles.attachmentList}>
                      {mediaAttachments.map((attachment) => (
                        <View key={attachment.id} style={styles.attachmentItem}>
                          <View style={styles.attachmentIconBubble}>
                            <Text style={styles.attachmentIcon}>{mediaTypeIcons[attachment.type]}</Text>
                          </View>
                          <View style={styles.attachmentMeta}>
                            <Text style={styles.attachmentName}>{attachment.filename}</Text>
                            <Text style={styles.attachmentDetails}>
                              {mediaTypeLabels[attachment.type]} · {formatBytes(attachment.sizeBytes)} · ready for sync
                            </Text>
                          </View>
                          <Pressable style={styles.removeAttachmentButton} onPress={() => removeMediaAttachment(attachment.id)}>
                            <Text style={styles.removeAttachmentText}>Remove</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <View style={styles.buttonStack}>
                  <Pressable style={styles.secondaryButton} onPress={() => saveOfflineDraft()}>
                    <Text style={styles.secondaryButtonText}>Save offline draft</Text>
                  </Pressable>
                  <Pressable style={styles.primaryButton} onPress={submitStory}>
                    <Text style={styles.primaryButtonText}>Save AI-assisted draft</Text>
                  </Pressable>
                </View>
                <Text style={styles.hintSmall}>If the backend is unavailable, AI-assisted save automatically falls back to the offline queue.</Text>
              </View>
            </View>
          )}

          {activeTab === 'offline' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Offline queue</Text>
              <Text style={styles.subtle}>Drafts, captured media, and safety check-ins prepared for sync when connectivity returns.</Text>
              {draftNotice && <Text style={styles.noticeText}>{draftNotice}</Text>}
              {safetyNotice && <Text style={styles.noticeText}>{safetyNotice}</Text>}
              {(localDrafts.length > 0 || localSafetyCheckIns.length > 0) && (
                <Pressable style={styles.primaryButton} onPress={syncQueuedItems}>
                  <Text style={styles.primaryButtonText}>Sync all queued items</Text>
                </Pressable>
              )}

              {localDrafts.length === 0 && localSafetyCheckIns.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.subtle}>No local offline items yet.</Text>
                </View>
              ) : null}

              {localDrafts.length > 0 ? (
                <View style={styles.queueGroup}>
                  <Text style={styles.cardTitle}>Queued drafts</Text>
                  {localDrafts.map((draft) => (
                    <View key={draft.id} style={styles.card}>
                      <View style={styles.cardHeaderRow}>
                        <View>
                          <Text style={styles.cardTitle}>{draft.title}</Text>
                          <Text style={styles.assignmentMeta}>
                            {draft.status} · {new Date(draft.updatedAt).toLocaleString()}
                          </Text>
                          <Text style={styles.assignmentMeta}>
                            {draft.assignmentId
                              ? `Linked to ${assignments.find((assignment) => assignment.id === draft.assignmentId)?.title || 'assignment'}`
                              : 'No assignment link'}
                          </Text>
                          {draft.mediaAttachments.length > 0 ? (
                            <Text style={styles.assignmentMeta}>
                              {draft.mediaAttachments.length} media attachment{draft.mediaAttachments.length === 1 ? '' : 's'} queued ·{' '}
                              {draft.mediaAttachments.map((attachment) => mediaTypeLabels[attachment.type]).join(', ')}
                            </Text>
                          ) : null}
                        </View>
                        <View style={styles.actionRow}>
                          <Pressable style={styles.secondaryButton} onPress={() => syncLocalDraft(draft)} disabled={syncingDraftId === draft.id}>
                            <Text style={styles.secondaryButtonText}>{syncingDraftId === draft.id ? 'Syncing…' : 'Sync'}</Text>
                          </Pressable>
                          <Pressable style={styles.dangerButton} onPress={() => discardLocalDraft(draft)} disabled={syncingDraftId === draft.id}>
                            <Text style={styles.dangerButtonText}>Discard</Text>
                          </Pressable>
                        </View>
                      </View>
                      <Text style={styles.assignmentBody} numberOfLines={3}>
                        {draft.body}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {localSafetyCheckIns.length > 0 ? (
                <View style={styles.queueGroup}>
                  <Text style={styles.cardTitle}>Queued safety check-ins</Text>
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
    alignItems: 'center',
    borderColor: colors.gray200,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  assignmentOptionSelected: {
    backgroundColor: colors.brandLight,
    borderColor: colors.brand,
  },
  assignmentOptionTitle: {
    color: colors.gray900,
    fontSize: 15,
    fontWeight: '800',
  },
  assignmentOptionTitleSelected: {
    color: colors.brand,
  },
  assignmentOptionMeta: {
    color: colors.gray600,
    fontSize: 12,
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
  attachmentIconBubble: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F5EFE2', alignItems: 'center', justifyContent: 'center' },
  attachmentIcon: { fontSize: 18 },
  attachmentMeta: { flex: 1 },
  attachmentName: { color: '#111827', fontWeight: '800' },
  attachmentDetails: { color: '#78716C', fontSize: 12, marginTop: 2 },
  removeAttachmentButton: { borderRadius: 999, borderWidth: 1, borderColor: '#E7E0D1', paddingHorizontal: 10, paddingVertical: 6 },
  removeAttachmentText: { color: colors.error, fontWeight: '800', fontSize: 12 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { color: '#7C2D12', backgroundColor: '#FFEDD5', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: '700' },
  dangerButton: { backgroundColor: '#B91C1C', borderRadius: 14, alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  dangerButtonText: { color: '#FFFFFF', fontWeight: '900' },
  linkText: { color: '#9A7B00', fontWeight: '900' },
  profileName: { fontSize: 24, fontWeight: '900', color: '#111827' },
  profileMeta: { color: '#44403C', fontSize: 16, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#E7E0D1', marginVertical: 4 },
});
