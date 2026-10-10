import type { CourseList } from '../api/client.js';
interface Props {
  open: boolean;
  courses: CourseList;
  selectedId?: string;
  accountName: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onCreate: () => void;
  onLogout: () => void;
}
export function Sidebar(p: Props) {
  return (
    <>
      {p.open && (
        <button className="drawer-overlay" aria-label="关闭课程侧边栏" onClick={p.onClose} />
      )}
      <aside
        className={`sidebar ${p.open ? 'open' : ''}`}
        aria-label="课程侧边栏"
        aria-hidden={!p.open}
        inert={!p.open}
      >
        <div className="account">
          <span className="avatar">我</span>
          <div>
            <strong>{p.accountName}</strong>
            <p className="muted small">已登录 · 个人学习空间</p>
          </div>
          <button className="icon-button" onClick={p.onClose} aria-label="收起侧边栏">
            ×
          </button>
        </div>
        <div className="sidebar-content">
          <button className="primary full" onClick={p.onCreate}>
            ＋ 添加新课程
          </button>
          <h2>我的课程</h2>
          {!p.courses.length && <p className="muted">创建第一门课程，开始你的学习。</p>}
          <nav aria-label="课程列表">
            {p.courses.map((c) => (
              <button
                key={c.id}
                className={`course-item ${c.id === p.selectedId ? 'selected' : ''}`}
                onClick={() => p.onSelect(c.id)}
                aria-label={`${c.name} ${c.progress}%`}
              >
                <span className="course-name">{c.name}</span>
                <span className="percentage">{c.progress}%</span>
                <progress max={100} value={c.progress} />
                <span className="muted small">
                  已完成 {c.completed} / {c.total} 节
                </span>
              </button>
            ))}
          </nav>
        </div>
        <button className="logout" onClick={p.onLogout}>
          退出登录
        </button>
      </aside>
    </>
  );
}
