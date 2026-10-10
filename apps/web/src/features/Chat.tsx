import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { CourseView } from '../api/client.js';
interface Props {
  course: CourseView;
  busy: boolean;
  error: string;
  onSend: (text: string, requestId?: string) => Promise<boolean>;
  onAdvance: () => void;
}
export function Chat({ course, busy, error, onSend, onAdvance }: Props) {
  const [draft, setDraft] = useState('');
  const retryRequest = useRef<{ content: string; id: string } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [course.messages.length, busy]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || busy) return;
    const content = draft;
    const request =
      retryRequest.current?.content === content
        ? retryRequest.current
        : { content, id: crypto.randomUUID() };
    retryRequest.current = request;
    if (await onSend(content, request.id)) {
      setDraft('');
      retryRequest.current = null;
    }
  }
  const failed = course.messages.findLast((m) => m.role === 'user' && m.status === 'failed');
  return (
    <>
      <section className="messages" aria-label="学习对话" aria-live="polite">
        <div className="learning-location">
          {course.phase === 'overview'
            ? '整体框架'
            : course.phase === 'finished'
              ? '框架学习已完成'
              : `当前：${course.currentTitle}`}
        </div>
        {!course.messages.length && (
          <div className="welcome">
            <span className="welcome-symbol">✦</span>
            <h2>{course.phase === 'overview' ? '先看全貌，再逐步深入' : '我们继续学习'}</h2>
            <p>告诉教练你想从哪里开始，或者直接说“带我理解整体框架”。</p>
            <p className="muted small">你决定何时继续，聊天不会自动改变进度。</p>
          </div>
        )}
        {course.messages.map((m) => (
          <article key={m.id} className={`message ${m.role}`}>
            <span className="message-avatar" aria-hidden="true">
              {m.role === 'assistant' ? '✦' : '我'}
            </span>
            <div className="bubble">
              <ReactMarkdown>{m.content}</ReactMarkdown>
              {m.status === 'failed' && <span className="muted small">回答未完成</span>}
            </div>
          </article>
        ))}
        {busy && <p className="generating">教练正在思考…</p>}
        <div ref={bottom} />
      </section>
      <div className="composer-wrap">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {failed && !busy && (
          <button
            className="text-button retry"
            onClick={() => onSend(failed.content, failed.requestId)}
          >
            重试上一个问题
          </button>
        )}
        {course.phase !== 'finished' && (
          <button className="next-step" onClick={onAdvance} disabled={busy}>
            {course.phase === 'overview' ? '开始深入' : '确认完成，下一步'}{' '}
            <span aria-hidden="true">→</span>
          </button>
        )}
        <form className="composer" onSubmit={submit}>
          <textarea
            aria-label="你的回答"
            placeholder="说点什么…"
            value={draft}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button aria-label="发送" className="send" disabled={busy || !draft.trim()}>
            <span aria-hidden="true">↑</span>
          </button>
        </form>
        <p className="composer-note">基于你的资料学习 · 进度由你确认</p>
      </div>
    </>
  );
}
