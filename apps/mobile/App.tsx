import { StatusBar } from 'expo-status-bar';
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
import type { Assignment, Story, User } from '@aj-now/shared';
import { COLORS, SPACING } from '@aj-now/shared';

type ApiEnvelope<T> = { success: boolean; data?: T; error?: string };
type TabKey = 'briefing' | 'assignments' | 'capture' | 'offline' | 'profile';

const API_BASE = 'http://localhost:3001/api';
const DEMO_EMAIL = 'leila.hassan@aljazeera.net';

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'briefing', label: 'Briefing' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'capture', label: 'Capture' },
  { key: 'offline', label: 'Offline' },
  { key: 'profile', label: 'Profile' },
];

const priorityColor: Record<string, string> = {
  breaking: '#E31B23',
  urgent: '#F59E0B',
  standard: '#2563EB',
  feature: '#7C3AED',
};

function formatTime(value?: string) {
  if (!value) return 'No deadline';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
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
  const [error, setError] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('Market reaction from Doha');
  const [draftBody, setDraftBody] = useState(
    'Early interviews suggest residents are watching regional inflation and fuel prices closely while government officials prepare a new policy briefing.'
  );

  const breakingAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.priority === 'breaking' || assignment.priority === 'urgent'),
    [assignments]
  );

  const activeAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.status !== 'filed' && assignment.status !== 'published'),
    [assignments]
  );

  async function loadData(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const login = await api<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: DEMO_EMAIL, password: 'demo' }),
      });
      const [assignmentData, storyData] = await Promise.all([
        api<Assignment[]>(`/assignments?userId=${login.user.id}`),
        api<Story[]>(`/stories?authorId=${login.user.id}`),
      ]);
      setUser(login.user);
      setAssignments(assignmentData);
      setStories(storyData);
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
  }, []);

  async function refresh() {
    setRefreshing(true);
    await loadData(false);
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

  async function submitStory() {
    if (!user) return;
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
      setActiveTab('offline');
    } catch (err) {
      Alert.alert('Unable to save draft', err instanceof Error ? err.message : 'Please try again.');
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
          <ActivityIndicator size="large" color={COLORS.gold} />
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.gold} />}
        >
          {activeTab === 'briefing' && (
            <View style={styles.section}>
              <Text style={styles.welcome}>Good evening, {user?.name?.split(' ')[0]}</Text>
              <Text style={styles.subtle}>Your newsroom queue, safety posture, and AI filing tools are ready.</Text>

              <View style={styles.metricsRow}>
                <Metric label="Active" value={activeAssignments.length.toString()} />
                <Metric label="Breaking" value={breakingAssignments.length.toString()} tone="red" />
                <Metric label="Drafts" value={stories.length.toString()} />
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
                  onAccept={() => updateAssignment(assignment, 'accepted')}
                  onStart={() => updateAssignment(assignment, 'in_progress')}
                />
              ))}
            </View>
          )}

          {activeTab === 'capture' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Story capture</Text>
              <Text style={styles.subtle}>PoC draft composer with AI summary/tag simulation through the backend.</Text>
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
                <View style={styles.captureGrid}>
                  <CaptureAction label="Photo" detail="Camera roll" />
                  <CaptureAction label="Video" detail="Clip upload" />
                  <CaptureAction label="Audio" detail="Transcript" />
                  <CaptureAction label="Location" detail="Geo tag" />
                </View>
                <Pressable style={styles.primaryButton} onPress={submitStory}>
                  <Text style={styles.primaryButtonText}>Save AI-assisted draft</Text>
                </Pressable>
              </View>
            </View>
          )}

          {activeTab === 'offline' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Offline queue</Text>
              <Text style={styles.subtle}>Drafts and captured media prepared for sync when connectivity returns.</Text>
              {stories.length === 0 ? (
                <View style={styles.card}><Text style={styles.subtle}>No local drafts yet.</Text></View>
              ) : stories.map((story) => <StoryCard key={story.id} story={story} />)}
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
                <Pressable style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Send check-in</Text>
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
  onAccept,
  onStart,
}: {
  assignment: Assignment;
  compact?: boolean;
  onAccept?: () => void;
  onStart?: () => void;
}) {
  return (
    <View style={styles.assignmentCard}>
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

function CaptureAction({ label, detail }: { label: string; detail: string }) {
  return (
    <View style={styles.captureAction}>
      <Text style={styles.captureLabel}>{label}</Text>
      <Text style={styles.captureDetail}>{detail}</Text>
    </View>
  );
}

function StoryCard({ story }: { story: Story }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.assignmentTitle}>{story.title}</Text>
        <View style={styles.statusPill}><Text style={styles.statusText}>{story.status}</Text></View>
      </View>
      <Text style={styles.assignmentBody}>{story.summary || story.body?.slice(0, 180)}</Text>
      <Text style={styles.assignmentMeta}>Updated {formatTime(story.updatedAt)} · {story.language?.toUpperCase()}</Text>
      <View style={styles.tagRow}>{story.tags?.slice(0, 4).map((tag) => <Text key={tag} style={styles.tag}>#{tag}</Text>)}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#050505' },
  header: {
    backgroundColor: '#050505',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrow: { color: COLORS.gold, fontSize: 12, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase' },
  title: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', marginTop: 2 },
  livePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#102A1E', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  liveDot: { color: '#22C55E', marginRight: 5, fontSize: 10 },
  liveText: { color: '#BBF7D0', fontSize: 11, fontWeight: '800' },
  tabBar: { backgroundColor: '#050505', paddingHorizontal: SPACING.md, paddingBottom: SPACING.md, gap: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: '#171717', borderWidth: 1, borderColor: '#2A2A2A' },
  tabActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  tabText: { color: '#D4D4D4', fontWeight: '700' },
  tabTextActive: { color: '#111111' },
  content: { flex: 1, backgroundColor: '#F5F1E8' },
  section: { padding: SPACING.lg, gap: SPACING.md },
  centered: { flex: 1, backgroundColor: '#F5F1E8', alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  loadingText: { marginTop: 12, color: '#44403C', fontWeight: '700' },
  errorTitle: { fontSize: 22, fontWeight: '900', color: '#111827', marginBottom: 8 },
  errorText: { textAlign: 'center', color: '#7F1D1D', marginBottom: 8 },
  hintText: { color: '#57534E', fontFamily: 'Courier', marginBottom: 16 },
  welcome: { fontSize: 28, fontWeight: '900', color: '#111827' },
  sectionTitle: { fontSize: 26, fontWeight: '900', color: '#111827' },
  subtle: { color: '#57534E', fontSize: 15, lineHeight: 22 },
  metricsRow: { flexDirection: 'row', gap: SPACING.sm },
  metricCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 18, padding: SPACING.md, borderWidth: 1, borderColor: '#E7E0D1' },
  metricValue: { fontSize: 30, fontWeight: '900', color: '#111827' },
  metricRed: { color: '#E31B23' },
  metricLabel: { color: '#78716C', fontWeight: '800', textTransform: 'uppercase', fontSize: 11 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: SPACING.md, borderWidth: 1, borderColor: '#E7E0D1', gap: 12 },
  cardDark: { backgroundColor: '#111111', borderRadius: 22, padding: SPACING.md, gap: 8 },
  cardTitle: { fontSize: 18, fontWeight: '900', color: '#111827' },
  cardTitleLight: { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },
  lightBody: { color: '#E7E5E4', lineHeight: 22 },
  assignmentCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: SPACING.md, borderWidth: 1, borderColor: '#E7E0D1', gap: 10 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  assignmentTitle: { flex: 1, fontSize: 17, fontWeight: '900', color: '#111827' },
  assignmentBody: { color: '#44403C', lineHeight: 21 },
  assignmentMeta: { color: '#78716C', fontSize: 12, fontWeight: '700' },
  priorityPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  priorityText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  statusPill: { backgroundColor: '#EEF2FF', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  statusText: { color: '#3730A3', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  actionRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: 4 },
  primaryButton: { backgroundColor: '#111111', borderRadius: 14, alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  primaryButtonSmall: { backgroundColor: '#111111', borderRadius: 12, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '900' },
  secondaryButton: { borderColor: '#111111', borderWidth: 1, borderRadius: 14, alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  secondaryButtonSmall: { borderColor: '#111111', borderWidth: 1, borderRadius: 12, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  secondaryButtonText: { color: '#111111', fontWeight: '900' },
  inputLabel: { color: '#44403C', fontWeight: '900', fontSize: 12, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: '#D6D3D1', borderRadius: 14, padding: 12, fontSize: 16, color: '#111827', backgroundColor: '#FFFCF7' },
  textArea: { minHeight: 130, textAlignVertical: 'top' },
  captureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  captureAction: { width: '48%', borderRadius: 16, borderWidth: 1, borderColor: '#E7E0D1', padding: SPACING.md, backgroundColor: '#FFFCF7' },
  captureLabel: { fontSize: 16, fontWeight: '900', color: '#111827' },
  captureDetail: { color: '#78716C', marginTop: 4 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { color: '#7C2D12', backgroundColor: '#FFEDD5', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: '700' },
  profileName: { fontSize: 24, fontWeight: '900', color: '#111827' },
  profileMeta: { color: '#44403C', fontSize: 16, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#E7E0D1', marginVertical: 4 },
});
