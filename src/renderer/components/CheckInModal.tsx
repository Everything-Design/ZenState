import React, { useState, useEffect, useCallback } from 'react';
import { X, Send } from 'lucide-react';
import {
  BasecampProject,
  BasecampQuestionnaire,
  BasecampQuestion,
  PinnedTodo,
  IPC,
} from '../../shared/types';

// ── Types ──────────────────────────────────────────────────────

interface Candidate {
  project: BasecampProject;
  questionnaire: BasecampQuestionnaire;
  question: BasecampQuestion;
}

interface Props {
  open: boolean;
  date: string; // YYYY-MM-DD
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function todayDayName(): string {
  return DAY_NAMES[new Date().getDay()];
}

function questionMatchesToday(q: BasecampQuestion): boolean {
  if (q.paused) return false;
  if (!q.scheduleDays || q.scheduleDays.length === 0) return true; // every weekday
  return q.scheduleDays.includes(todayDayName());
}

function formatEstimate(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `~${h}h ${m}m`;
  if (h > 0) return `~${h}h`;
  return `~${m}m`;
}

function buildDraft(items: PinnedTodo[]): string {
  const header = 'Today I\'m working on:';
  if (items.length === 0) return header;
  const bullets = items
    .map((item) => {
      const estimate = item.estimateMinutes ? ` — ${formatEstimate(item.estimateMinutes)}` : '';
      return `• ${item.content}${estimate}`;
    })
    .join('\n');
  return `${header}\n${bullets}`;
}

// ── Async data loading ─────────────────────────────────────────

async function loadCandidates(): Promise<Candidate[]> {
  const projectsResult = await window.zenstate.bcListProjects();
  if (!projectsResult.ok || !projectsResult.data) return [];

  const projects = projectsResult.data;
  const questionnaireResults = await Promise.all(
    projects.map(async (project) => {
      try {
        const q = await window.zenstate.bcGetQuestionnaireForProject(project.id);
        return q ? { project, questionnaire: q as BasecampQuestionnaire } : null;
      } catch {
        return null;
      }
    }),
  );

  const withQuestionnaires = questionnaireResults.filter(
    (r): r is { project: BasecampProject; questionnaire: BasecampQuestionnaire } => r !== null,
  );

  const candidateLists = await Promise.all(
    withQuestionnaires.map(async ({ project, questionnaire }) => {
      try {
        const questions = await window.zenstate.bcGetQuestions(project.id, questionnaire.id);
        const active = (questions as BasecampQuestion[]).filter(questionMatchesToday);
        return active.map((question) => ({ project, questionnaire, question }));
      } catch {
        return [];
      }
    }),
  );

  return candidateLists.flat();
}

async function loadDraft(): Promise<string> {
  try {
    const { plan } = await window.zenstate.todayGet();
    return buildDraft(plan.items);
  } catch {
    return 'Today I\'m working on:';
  }
}

// ── Component ─────────────────────────────────────────────────

type LoadState = 'loading' | 'ready' | 'empty' | 'error';

export default function CheckInModal({ open, date, onClose }: Props) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  // Load data when modal opens
  useEffect(() => {
    if (!open) return;
    setLoadState('loading');
    setPostError(null);

    Promise.all([loadCandidates(), loadDraft()]).then(([loaded, draftText]) => {
      if (loaded.length === 0) {
        setLoadState('empty');
        return;
      }
      setCandidates(loaded);
      setSelectedProjectId(loaded[0].project.id);
      setSelectedQuestionId(loaded[0].question.id);
      setDraft(draftText);
      setLoadState('ready');
    }).catch(() => {
      setLoadState('error');
    });
  }, [open, date]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleSkip(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSkip = useCallback(async () => {
    try {
      const settings = await window.zenstate.getSettings();
      await window.zenstate.saveSettings({ ...settings, lastCheckInDate: date });
    } catch {
      // non-critical
    }
    onClose();
  }, [date, onClose]);

  const handlePost = useCallback(async () => {
    if (selectedProjectId === null || selectedQuestionId === null) return;
    setPosting(true);
    setPostError(null);
    try {
      await window.zenstate.bcPostQuestionAnswer(selectedProjectId, selectedQuestionId, draft);
      onClose();
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Failed to post. Try again.');
      setPosting(false);
    }
  }, [selectedProjectId, selectedQuestionId, draft, onClose]);

  // Derived selections
  const projectsInCandidates = React.useMemo(() => {
    const seen = new Set<number>();
    return candidates.filter((c) => {
      if (seen.has(c.project.id)) return false;
      seen.add(c.project.id);
      return true;
    }).map((c) => c.project);
  }, [candidates]);

  const questionsForProject = React.useMemo(
    () => candidates.filter((c) => c.project.id === selectedProjectId).map((c) => c.question),
    [candidates, selectedProjectId],
  );

  const selectedQuestion = React.useMemo(
    () => candidates.find((c) => c.question.id === selectedQuestionId)?.question ?? null,
    [candidates, selectedQuestionId],
  );

  const handleProjectChange = useCallback((projectId: number) => {
    setSelectedProjectId(projectId);
    const first = candidates.find((c) => c.project.id === projectId);
    setSelectedQuestionId(first?.question.id ?? null);
  }, [candidates]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={handleSkip}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 500,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '18px 20px 12px',
          borderBottom: '1px solid var(--zen-divider)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--zen-text)' }}>
              Good morning! Time for your check-in.
            </div>
            {loadState === 'ready' && (
              <div style={{ fontSize: 11, color: 'var(--zen-tertiary-text)', marginTop: 2 }}>
                Auto-drafted from your Today plan. Edit before posting.
              </div>
            )}
          </div>
          <button
            onClick={handleSkip}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--zen-tertiary-text)',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              borderRadius: 4,
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{
          padding: '16px 20px',
          overflowY: 'auto',
          flex: 1,
          fontSize: 'var(--text-sm)',
          lineHeight: 1.55,
          color: 'var(--zen-text)',
        }}>
          {loadState === 'loading' && (
            <div style={{ color: 'var(--zen-secondary-text)', textAlign: 'center', padding: '24px 0' }}>
              Loading check-ins...
            </div>
          )}

          {loadState === 'error' && (
            <div style={{ color: 'var(--zen-secondary-text)', textAlign: 'center', padding: '24px 0' }}>
              Could not load check-ins. Check your Basecamp connection.
            </div>
          )}

          {loadState === 'empty' && (
            <div style={{ color: 'var(--zen-secondary-text)', textAlign: 'center', padding: '24px 0' }}>
              No active check-ins found for today.
            </div>
          )}

          {loadState === 'ready' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Project picker (only when >1 project) */}
              {projectsInCandidates.length > 1 && (
                <div>
                  <label style={{ fontSize: 11, color: 'var(--zen-tertiary-text)', display: 'block', marginBottom: 5, fontWeight: 500 }}>
                    PROJECT
                  </label>
                  <select
                    className="text-input"
                    value={selectedProjectId ?? ''}
                    onChange={(e) => handleProjectChange(Number(e.target.value))}
                    style={{ fontSize: 'var(--text-sm)' }}
                  >
                    {projectsInCandidates.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Single project: show name as header */}
              {projectsInCandidates.length === 1 && (
                <div style={{ fontSize: 11, color: 'var(--zen-tertiary-text)', fontWeight: 500 }}>
                  {projectsInCandidates[0].name}
                </div>
              )}

              {/* Question picker (only when >1 question) */}
              {questionsForProject.length > 1 && (
                <div>
                  <label style={{ fontSize: 11, color: 'var(--zen-tertiary-text)', display: 'block', marginBottom: 5, fontWeight: 500 }}>
                    QUESTION
                  </label>
                  <select
                    className="text-input"
                    value={selectedQuestionId ?? ''}
                    onChange={(e) => setSelectedQuestionId(Number(e.target.value))}
                    style={{ fontSize: 'var(--text-sm)' }}
                  >
                    {questionsForProject.map((q) => (
                      <option key={q.id} value={q.id}>{q.title}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Question title when only one, or after selection */}
              {selectedQuestion && (
                <div style={{
                  fontSize: 'var(--text-base)',
                  fontWeight: 500,
                  color: 'var(--zen-text)',
                  lineHeight: 1.4,
                }}>
                  {selectedQuestion.title}
                </div>
              )}

              {/* Draft textarea */}
              <textarea
                className="text-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={6}
                style={{
                  resize: 'vertical',
                  fontSize: 'var(--text-sm)',
                  lineHeight: 1.6,
                  fontFamily: 'inherit',
                }}
              />

              {/* Post error */}
              {postError && (
                <div style={{ fontSize: 11, color: '#ff453a' }}>
                  {postError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px 16px',
          borderTop: '1px solid var(--zen-divider)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}>
          <button
            className="btn"
            onClick={handleSkip}
            style={{ color: 'var(--zen-secondary-text)', background: 'var(--zen-secondary-bg)' }}
          >
            Skip today
          </button>

          {loadState === 'ready' && (
            <button
              className="btn btn-primary"
              onClick={handlePost}
              disabled={posting || !draft.trim() || selectedProjectId === null || selectedQuestionId === null}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Send size={13} />
              {posting ? 'Posting...' : 'Post to Basecamp'}
            </button>
          )}

          {(loadState === 'empty' || loadState === 'error') && (
            <button className="btn btn-primary" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
