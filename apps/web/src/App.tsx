import { useState, useEffect, useRef } from 'react';
import {
  CoachApi,
  ApiError,
  type Session,
  type CourseView,
  type CourseList,
} from './api/client.js';
import { Sidebar } from './features/Sidebar.js';
import { Chat } from './features/Chat.js';
import { CreateCourse } from './features/CreateCourse.js';
const api = new CoachApi();
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [courses, setCourses] = useState<CourseList>([]);
  const [course, setCourse] = useState<CourseView | null>(null);
  const [sidebar, setSidebar] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const selected = useRef<string | null>(null);
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  async function select(id: string) {
    selected.current = id;
    setSidebar(false);
    setError('');
    setCourse(null);
    localStorage.setItem('coach-course', id);
    try {
      const data = await api.course(id);
      if (selected.current === id) setCourse(data);
    } catch (e) {
      handleError(e);
    }
  }
  function handleError(e: unknown) {
    if (e instanceof ApiError && e.status === 401) {
      setSession((s) => (s ? { ...s, authenticated: false } : null));
      setCourse(null);
    }
    setError((e as Error).message);
  }
  async function reloadCourses() {
    const list = await api.list();
    setCourses(list);
    return list;
  }
  async function initialize() {
    setLoading(true);
    try {
      const s = await api.session();
      setSession(s);
      if (s.authenticated) {
        const list = await reloadCourses();
        const saved = localStorage.getItem('coach-course');
        const id = list.find((c) => c.id === saved)?.id ?? list[0]?.id;
        if (id) await select(id);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void initialize();
  }, []);
  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get('password'));
    setLoggingIn(true);
    setLoginError('');
    try {
      await api.login(password);
      await initialize();
    } catch (e) {
      setLoginError((e as Error).message);
    } finally {
      setLoggingIn(false);
    }
  }
  async function send(text: string, requestId: string = crypto.randomUUID()) {
    if (!course || busy) return false;
    const id = course.id;
    setBusy(true);
    setError('');
    try {
      const updated = await api.send(id, requestId, text);
      if (selected.current === id) setCourse(updated);
      return true;
    } catch (e) {
      if (selected.current === id) {
        handleError(e);
        try {
          setCourse(await api.course(id));
        } catch {}
      }
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function advance() {
    if (!course || busy) return;
    const id = course.id;
    const version = course.version;
    setBusy(true);
    setError('');
    try {
      const updated = await api.advance(id, crypto.randomUUID(), version);
      if (selected.current === id) setCourse(updated);
      await reloadCourses();
      if (updated.phase !== 'finished') {
        const answer = await api.send(
          id,
          crypto.randomUUID(),
          '我已确认继续，请引导我学习当前节点。',
        );
        if (selected.current === id) setCourse(answer);
      }
    } catch (e) {
      handleError(e);
      try {
        const fresh = await api.course(id);
        if (selected.current === id) setCourse(fresh);
      } catch {}
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await api.logout();
      setSession((s) => (s ? { ...s, authenticated: false } : null));
      setCourse(null);
      setCourses([]);
      setSidebar(false);
      selected.current = null;
      setError('');
    } catch (e) {
      handleError(e);
    }
  }
  if (loading)
    return (
      <main className="login-page">
        <p>正在恢复学习空间…</p>
      </main>
    );
  if (!session)
    return (
      <main className="login-page">
        <p role="alert">{error || '服务连接失败'}</p>
        <button onClick={initialize}>重试连接</button>
      </main>
    );
  if (!session.authenticated)
    return (
      <main className="login-page">
        <form onSubmit={login} className="login-card">
          <span className="welcome-symbol">✦</span>
          <h1>学习 Coach</h1>
          <p className="muted">从整体出发，按自己的节奏学习。</p>
          <label>
            个人密码
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              maxLength={256}
            />
          </label>
          {loginError && (
            <p className="error" role="alert">
              {loginError}
            </p>
          )}
          <button className="primary full" disabled={loggingIn}>
            {loggingIn ? '正在登录…' : '登录'}
          </button>
          <p className="small muted">仅供个人使用，资料与学习记忆保存在服务端。</p>
        </form>
      </main>
    );
  return (
    <div className="app-shell">
      <Sidebar
        open={sidebar}
        courses={courses}
        selectedId={course?.id}
        accountName={session.accountName}
        onSelect={select}
        onClose={() => setSidebar(false)}
        onCreate={() => {
          setCreating(true);
          setSidebar(false);
        }}
        onLogout={logout}
      />
      <main className="chat-main">
        <header className="topbar">
          <button
            className="icon-button menu"
            aria-label="打开课程侧边栏"
            onClick={() => setSidebar(true)}
          >
            ☰
          </button>
          <h1>{course?.name ?? '学习 Coach'}</h1>
          <span className="avatar small-avatar" title={session.accountName}>
            我
          </span>
        </header>
        {session.demo && <div className="demo-banner">测试模型模式 · 非真实百炼回答</div>}
        {course ? (
          <Chat
            key={course.id}
            course={course}
            busy={busy}
            error={error}
            onSend={send}
            onAdvance={advance}
          />
        ) : (
          <section className="empty">
            <span className="welcome-symbol">✦</span>
            <h2>{selected.current ? '正在恢复课程…' : '你的学习，从这里开始'}</h2>
            <p className="muted">准备好 Markdown 框架与资料，建立第一门课程。</p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" onClick={() => setCreating(true)}>
              添加新课程
            </button>
          </section>
        )}
      </main>
      {creating && (
        <CreateCourse
          api={api}
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setCreating(false);
            setCourse(c);
            selected.current = c.id;
            localStorage.setItem('coach-course', c.id);
            setError('');
            void reloadCourses();
          }}
        />
      )}
    </div>
  );
}
