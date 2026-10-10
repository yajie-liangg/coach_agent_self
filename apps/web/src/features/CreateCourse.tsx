import { useRef, useEffect, useState } from 'react';
import type { CoachApi, CourseView } from '../api/client.js';
interface Props {
  api: CoachApi;
  onCreated: (course: CourseView) => void;
  onClose: () => void;
}
export function CreateCourse({ api, onCreated, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      const framework = data.get('framework') as File;
      const materials = data.get('materials') as File;
      for (const file of [framework, materials])
        if (!file.name.toLowerCase().endsWith('.md') || file.size > 1024 * 1024 || !file.size)
          throw new Error('请选择非空 .md 文件，每份最大 1 MB');
      onCreated(
        await api.create(String(data.get('name')), await framework.text(), await materials.text()),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="course-dialog"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
      aria-labelledby="create-title"
    >
      <div className="dialog-title">
        <h2 id="create-title">创建课程</h2>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          disabled={busy}
          aria-label="关闭创建课程"
        >
          ×
        </button>
      </div>
      <p className="muted">上传按标注协议整理好的框架和资料。课程之间的对话与进度独立保存。</p>
      <form onSubmit={submit}>
        <label>
          课程名称
          <input name="name" required maxLength={100} autoFocus placeholder="例如：产品经理基础" />
        </label>
        <label>
          框架文件
          <input type="file" name="framework" accept=".md,text/markdown" required />
        </label>
        <label>
          资料文件
          <input type="file" name="materials" accept=".md,text/markdown" required />
        </label>
        <p className="muted small">
          每份文件最大 1 MB。资料及对话会发送给百炼处理，不进行网页搜索。
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary full" disabled={busy}>
          {busy ? '正在导入…' : '创建课程'}
        </button>
      </form>
    </dialog>
  );
}
