import { useEffect, useMemo, useRef, useState } from 'react';
import { isSupabaseConfigured, supabase } from './lib/supabaseClient.js';
import { driveAudioCandidates, previewDriveUrl, formatTime } from './lib/drive.js';

const PAGE_SIZE = 1000;
const STATUS_LABELS = {
  'not-heard': 'Not heard',
  hearing: 'Hearing',
  completed: 'Completed',
};

function classNames(...items) {
  return items.filter(Boolean).join(' ');
}

function normalizeProgress(rows) {
  const map = new Map();
  for (const row of rows || []) map.set(row.recording_id, row);
  return map;
}

async function fetchAllFrom(table, select = '*', orderColumn = 'file_number') {
  let all = [];
  let from = 0;
  while (true) {
    const to = from + PAGE_SIZE - 1;
    let query = supabase.from(table).select(select).range(from, to);
    if (orderColumn) query = query.order(orderColumn, { ascending: true });
    const { data, error } = await query;
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

function ConfigMissing() {
  return (
    <div className="center-shell">
      <div className="card setup-card">
        <h1>Srila Prabhupada Audio Portal</h1>
        <p>
          Supabase is not configured yet. Copy <code>.env.example</code> to <code>.env.local</code> and add your Supabase URL and anon key.
        </p>
        <pre>VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co{`\n`}VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY</pre>
      </div>
    </div>
  );
}

function AuthScreen() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function signInWithGoogle() {
    setLoading(true);
    setMessage('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        scopes: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
      },
    });
    if (error) setMessage(error.message);
    setLoading(false);
  }

  async function sendMagicLink(event) {
    event.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setMessage('');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (error) setMessage(error.message);
    else setMessage('Please check your email for the sign-in link.');
  }

  return (
    <div className="auth-bg">
      <div className="auth-card">
        <div className="brand-mark">SP</div>
        <p className="eyebrow">Devotee Hearing Tracker</p>
        <h1>Srila Prabhupada Audio Portal</h1>
        <p className="muted">
          Sign in to track your hearing progress, save notes, resume audio, and complete the full 4242 recording journey.
        </p>
        <button className="primary full" onClick={signInWithGoogle} disabled={loading}>
          Continue with Google
        </button>
        <div className="divider"><span>or</span></div>
        <form onSubmit={sendMagicLink} className="email-form">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button className="secondary" disabled={loading || !email.trim()}>Send magic link</button>
        </form>
        {message && <p className="auth-message">{message}</p>}
      </div>
    </div>
  );
}

function Header({ user, onSignOut, stats }) {
  const name = user?.user_metadata?.full_name || user?.email || 'Devotee';
  const avatar = user?.user_metadata?.avatar_url;
  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">Srila Prabhupada Audio Library</p>
        <h1>Hearing Progress Portal</h1>
      </div>
      <div className="header-actions">
        <div className="mini-progress">
          <strong>{stats.percent}%</strong>
          <span>{stats.completed} / {stats.total} completed</span>
        </div>
        <div className="user-pill">
          {avatar ? <img src={avatar} alt="Profile" /> : <span className="avatar-fallback">{name.slice(0, 1).toUpperCase()}</span>}
          <span>{name}</span>
        </div>
        <button className="ghost" onClick={onSignOut}>Sign out</button>
      </div>
    </header>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

function AudioPlayer({ current, progress, onStatusChange, onProgressPatch, onPrev, onNext }) {
  const audioRef = useRef(null);
  const lastSavedAt = useRef(0);
  const loadedRecordingId = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(0.9);
  const [audioFailed, setAudioFailed] = useState(false);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [playError, setPlayError] = useState('');

  useEffect(() => {
    setAudioFailed(false);
    setPlayError('');
    setSourceIndex(0);
    setIsPlaying(false);
    setTime(0);
    setDuration(0);
    loadedRecordingId.current = null;
    lastSavedAt.current = 0;
  }, [current?.id]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
      audioRef.current.volume = volume;
    }
  }, [speed, volume]);

  const sources = current ? driveAudioCandidates(current) : [];
  const src = sources[sourceIndex] || '';

  function tryNextSource(message = '') {
    if (sourceIndex < sources.length - 1) {
      setPlayError(message || 'Trying another Drive playback URL...');
      setSourceIndex((index) => index + 1);
      setAudioFailed(false);
      setTimeout(() => {
        const audio = audioRef.current;
        if (audio) {
          audio.load();
          audio.play().catch(() => setAudioFailed(true));
        }
      }, 150);
    } else {
      setPlayError(message || 'Direct audio playback failed. Use Drive preview or move audio to public storage.');
      setAudioFailed(true);
    }
  }

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !current) return;
    try {
      if (audio.paused) {
        await audio.play();
        setIsPlaying(true);
        if ((progress?.status || 'not-heard') === 'not-heard') onStatusChange(current.id, 'hearing');
      } else {
        audio.pause();
        setIsPlaying(false);
        onProgressPatch(current.id, { last_position_seconds: Math.floor(audio.currentTime) });
      }
    } catch (error) {
      tryNextSource(error?.message || 'Browser could not start this Drive audio URL.');
    }
  }

  function onLoadedMetadata() {
    const audio = audioRef.current;
    if (!audio || !current) return;
    setDuration(audio.duration || 0);
    if (loadedRecordingId.current !== current.id) {
      loadedRecordingId.current = current.id;
      const resumeAt = Number(progress?.last_position_seconds || 0);
      if (resumeAt > 0 && Number.isFinite(audio.duration) && resumeAt < audio.duration - 3) {
        audio.currentTime = resumeAt;
        setTime(resumeAt);
      }
    }
  }

  function onTimeUpdate() {
    const audio = audioRef.current;
    if (!audio || !current) return;
    setTime(audio.currentTime || 0);
    setDuration(audio.duration || 0);
    const now = Date.now();
    if (now - lastSavedAt.current > 10000) {
      lastSavedAt.current = now;
      onProgressPatch(current.id, { last_position_seconds: Math.floor(audio.currentTime || 0) }, { quiet: true });
    }
  }

  function seek(event) {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Number(event.target.value);
    audio.currentTime = next;
    setTime(next);
    if (current) onProgressPatch(current.id, { last_position_seconds: Math.floor(next) }, { quiet: true });
  }

  function markCompleted() {
    if (!current) return;
    onStatusChange(current.id, 'completed', { last_position_seconds: Math.floor(duration || time || 0) });
    setIsPlaying(false);
  }

  if (!current) {
    return (
      <aside className="player empty-player">
        <p className="eyebrow">Player</p>
        <h2>Select a recording</h2>
        <p className="muted">Choose any lecture from the list to start hearing and tracking your progress.</p>
      </aside>
    );
  }

  const preview = previewDriveUrl(current);
  const status = progress?.status || 'not-heard';

  return (
    <aside className="player">
      <p className="eyebrow">Now playing</p>
      <h2>{current.file_number} — {current.title}</h2>
      <p className="muted small-line">{current.category} {current.verse ? `• ${current.verse}` : ''}</p>
      <p className="muted small-line">{current.lectured_date} {current.lectured_location ? `• ${current.lectured_location}` : ''}</p>

      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        controls
        className="native-audio"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onEnded={markCompleted}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onCanPlay={() => { setAudioFailed(false); setPlayError(''); }}
        onError={() => tryNextSource('This Drive URL did not load as playable MP3 audio.')}
      />

      {playError && <p className="play-error">{playError}</p>}

      <div className="player-controls">
        <button className="round" onClick={onPrev} title="Previous">‹</button>
        <button className="play" onClick={togglePlay}>{isPlaying ? 'Pause' : 'Play'}</button>
        <button className="round" onClick={onNext} title="Next">›</button>
      </div>

      <div className="seek-row">
        <span>{formatTime(time)}</span>
        <input type="range" min="0" max={Math.floor(duration || 0)} value={Math.floor(time || 0)} onChange={seek} />
        <span>{formatTime(duration)}</span>
      </div>

      <div className="player-options">
        <label>Speed
          <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
            <option value="0.75">0.75×</option>
            <option value="1">1×</option>
            <option value="1.25">1.25×</option>
            <option value="1.5">1.5×</option>
            <option value="2">2×</option>
          </select>
        </label>
        <label>Volume
          <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
        </label>
      </div>

      <div className="status-row">
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <button
            key={key}
            className={classNames('status-btn', status === key && 'active', key)}
            onClick={() => onStatusChange(current.id, key)}
          >
            {label}
          </button>
        ))}
      </div>

      <a className="drive-link" href={current.drive_url} target="_blank" rel="noreferrer">Open original Drive file</a>

      {audioFailed && (
        <div className="fallback-box">
          <strong>Drive direct playback did not start.</strong>
          <p>Use the Drive preview below. For full custom controls on every file, keep the Drive files public or move audio to Supabase Storage / Cloudflare R2.</p>
          <iframe title="Google Drive preview" src={preview} allow="autoplay" />
        </div>
      )}
    </aside>
  );
}

function NotesPanel({ current, progress, onSave }) {
  const [notes, setNotes] = useState('');
  const [likedPoints, setLikedPoints] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setNotes(progress?.notes || '');
    setLikedPoints(progress?.liked_points || '');
    setSaved(false);
  }, [current?.id, progress?.notes, progress?.liked_points]);

  if (!current) return null;

  async function save() {
    await onSave(current.id, { notes, liked_points: likedPoints });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="card notes-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Reflection</p>
          <h2>Points I liked</h2>
        </div>
        <button className="primary" onClick={save}>{saved ? 'Saved' : 'Save notes'}</button>
      </div>
      <label>
        Favorite points / quotes
        <textarea value={likedPoints} onChange={(event) => setLikedPoints(event.target.value)} placeholder="Write the points, teachings, examples, or quotes you liked..." />
      </label>
      <label>
        Personal notes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Write your personal realizations or action points..." />
      </label>
    </div>
  );
}

function RecordingTable({ recordings, progressMap, currentId, onPlay, onStatusChange }) {
  return (
    <div className="recording-list">
      {recordings.map((recording) => {
        const progress = progressMap.get(recording.id);
        const status = progress?.status || 'not-heard';
        return (
          <article key={recording.id} className={classNames('recording-row', currentId === recording.id && 'current')}>
            <button className="row-play" onClick={() => onPlay(recording)}>{currentId === recording.id ? 'Playing' : 'Play'}</button>
            <div className="recording-main">
              <div className="recording-title">
                <strong>{recording.file_number}. {recording.title}</strong>
                <span className={classNames('badge', status)}>{STATUS_LABELS[status]}</span>
              </div>
              <p>{recording.category} {recording.verse ? `• ${recording.verse}` : ''}</p>
              <small>{recording.lectured_date || 'Date unknown'} {recording.lectured_location ? `• ${recording.lectured_location}` : ''}</small>
            </div>
            <div className="row-actions">
              <button onClick={() => onStatusChange(recording.id, 'not-heard')}>Not heard</button>
              <button onClick={() => onStatusChange(recording.id, 'hearing')}>Hearing</button>
              <button onClick={() => onStatusChange(recording.id, 'completed')}>Completed</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [recordings, setRecordings] = useState([]);
  const [progressMap, setProgressMap] = useState(new Map());
  const [current, setCurrent] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session || null);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setLoading(false);
      return;
    }
    loadData();
  }, [session?.user?.id]);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [recordingRows, progressRows] = await Promise.all([
        fetchAllFrom('recordings', '*', 'file_number'),
        fetchAllFrom('user_recording_progress', '*', 'recording_id'),
      ]);
      setRecordings(recordingRows);
      setProgressMap(normalizeProgress(progressRows));
      if (!current && recordingRows.length) setCurrent(recordingRows[0]);
    } catch (err) {
      setError(err.message || 'Could not load data. Please check Supabase tables and RLS policies.');
    } finally {
      setLoading(false);
    }
  }

  async function patchProgress(recordingId, patch, options = {}) {
    if (!session?.user || !recordingId) return;
    const existing = progressMap.get(recordingId) || {};
    const next = {
      user_id: session.user.id,
      recording_id: recordingId,
      status: patch.status || existing.status || 'not-heard',
      notes: patch.notes ?? existing.notes ?? '',
      liked_points: patch.liked_points ?? existing.liked_points ?? '',
      last_position_seconds: patch.last_position_seconds ?? existing.last_position_seconds ?? 0,
      completed_at: (patch.status || existing.status) === 'completed' ? new Date().toISOString() : existing.completed_at ?? null,
      updated_at: new Date().toISOString(),
    };
    setProgressMap((old) => new Map(old).set(recordingId, next));
    const { data, error: saveError } = await supabase
      .from('user_recording_progress')
      .upsert(next, { onConflict: 'user_id,recording_id' })
      .select()
      .single();
    if (saveError) {
      if (!options.quiet) setError(saveError.message);
      return;
    }
    setProgressMap((old) => new Map(old).set(recordingId, data));
  }

  function updateStatus(recordingId, status, extra = {}) {
    patchProgress(recordingId, { status, ...extra });
  }

  const categories = useMemo(() => {
    return ['all', ...Array.from(new Set(recordings.map((item) => item.category).filter(Boolean))).sort()];
  }, [recordings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recordings.filter((item) => {
      const status = progressMap.get(item.id)?.status || 'not-heard';
      if (category !== 'all' && item.category !== category) return false;
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (!q) return true;
      return [item.file_number, item.title, item.verse, item.lectured_date, item.lectured_location, item.filename]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [recordings, progressMap, query, category, statusFilter]);

  const stats = useMemo(() => {
    const total = recordings.length;
    let completed = 0;
    let hearing = 0;
    for (const item of recordings) {
      const status = progressMap.get(item.id)?.status || 'not-heard';
      if (status === 'completed') completed += 1;
      if (status === 'hearing') hearing += 1;
    }
    const notHeard = Math.max(total - completed - hearing, 0);
    const percent = total ? Math.round((completed / total) * 100) : 0;
    return { total, completed, hearing, notHeard, percent };
  }, [recordings, progressMap]);

  const currentProgress = current ? progressMap.get(current.id) : null;
  const visibleCurrentIndex = current ? filtered.findIndex((item) => item.id === current.id) : -1;

  function playRecording(recording) {
    setCurrent(recording);
    if ((progressMap.get(recording.id)?.status || 'not-heard') === 'not-heard') {
      patchProgress(recording.id, { status: 'hearing' }, { quiet: true });
    }
  }

  function goPrev() {
    if (!filtered.length) return;
    const index = visibleCurrentIndex > 0 ? visibleCurrentIndex - 1 : 0;
    setCurrent(filtered[index]);
  }

  function goNext() {
    if (!filtered.length) return;
    const index = visibleCurrentIndex >= 0 && visibleCurrentIndex < filtered.length - 1 ? visibleCurrentIndex + 1 : 0;
    setCurrent(filtered[index]);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setRecordings([]);
    setProgressMap(new Map());
    setCurrent(null);
  }

  if (!isSupabaseConfigured) return <ConfigMissing />;
  if (!session) return <AuthScreen />;

  return (
    <div className="app-shell">
      <Header user={session.user} onSignOut={signOut} stats={stats} />

      <main className="dashboard-grid">
        <section className="content-column">
          <div className="stats-grid">
            <StatCard label="Total recordings" value={stats.total} />
            <StatCard label="Completed" value={stats.completed} hint={`${stats.percent}% of library`} />
            <StatCard label="Currently hearing" value={stats.hearing} />
            <StatCard label="Not heard" value={stats.notHeard} />
          </div>

          <div className="card filters-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Catalogue</p>
                <h2>Recordings</h2>
              </div>
              <span className="muted">Showing {filtered.length} of {recordings.length}</span>
            </div>
            <div className="filters">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, verse, place, date..." />
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {categories.map((item) => <option key={item} value={item}>{item === 'all' ? 'All categories' : item}</option>)}
              </select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All status</option>
                <option value="not-heard">Not heard</option>
                <option value="hearing">Hearing</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            {error && <div className="error-box">{error}</div>}
            {loading ? (
              <div className="loading">Loading recordings and your profile progress...</div>
            ) : (
              <RecordingTable
                recordings={filtered}
                progressMap={progressMap}
                currentId={current?.id}
                onPlay={playRecording}
                onStatusChange={updateStatus}
              />
            )}
          </div>
        </section>

        <section className="side-column">
          <AudioPlayer
            current={current}
            progress={currentProgress}
            onStatusChange={updateStatus}
            onProgressPatch={patchProgress}
            onPrev={goPrev}
            onNext={goNext}
          />
          <NotesPanel current={current} progress={currentProgress} onSave={patchProgress} />
        </section>
      </main>
    </div>
  );
}
