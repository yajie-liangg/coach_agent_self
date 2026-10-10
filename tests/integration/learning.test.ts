import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStore } from '../../apps/server/src/infrastructure/store.js';
import { CourseService } from '../../apps/server/src/features/courses.js';
import { ChatService } from '../../apps/server/src/features/chat.js';
import type { Model, ModelMessage } from '../../apps/server/src/features/model.js';
const framework = readFileSync('tests/fixtures/framework.md', 'utf8');
const materials = readFileSync('tests/fixtures/materials.md', 'utf8');
const resources: { store: SqliteStore; dir: string }[] = [];
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'coach-'));
  const store = new SqliteStore(join(dir, 'db.sqlite'));
  resources.push({ store, dir });
  const courses = new CourseService(store);
  const c = courses.create('产品经理', framework, materials);
  return { store, courses, c, dir };
}
afterEach(() => {
  for (const r of resources.splice(0)) {
    r.store.close();
    rmSync(r.dir, { recursive: true, force: true });
  }
});
class FakeModel implements Model {
  requests: ModelMessage[][] = [];
  async complete(messages: ModelMessage[]) {
    this.requests.push(messages);
    return '我们继续讨论：你怎样区分问题和方案？';
  }
}
describe('SQLite 学习闭环', () => {
  it('用户推进有阶段、版本、幂等和完成计数', () => {
    const { courses, c } = setup();
    expect(c.phase).toBe('overview');
    let next = courses.advance(c.id, 'op1', 0);
    expect(next).toMatchObject({
      phase: 'detail',
      currentNodeId: 'real-needs',
      progress: 0,
      version: 1,
    });
    expect(courses.advance(c.id, 'op1', 0).version).toBe(1);
    expect(() => courses.advance(c.id, 'old', 0)).toThrow(/状态已更新/);
    next = courses.advance(c.id, 'op2', 1);
    expect(next).toMatchObject({ currentNodeId: 'priority', progress: 50 });
    next = courses.advance(c.id, 'op3', 2);
    expect(next).toMatchObject({ phase: 'finished', progress: 100 });
  });
  it('重启数据库恢复状态及消息，不混合课程', async () => {
    const { store, courses, c, dir } = setup();
    const other = courses.create(
      '另一课程',
      framework,
      materials.replace('需求、方案', '另一门课独有秘密'),
    );
    courses.advance(c.id, 'op1', 0);
    const model = new FakeModel();
    const chat = new ChatService(store, model);
    await chat.send(c.id, 'q1', '解释当前节点');
    expect(model.requests[0].map((m) => m.content).join('\n')).not.toContain('另一门课独有秘密');
    expect(courses.get(other.id).messages).toHaveLength(0);
    store.close();
    const reopened = new SqliteStore(join(dir, 'db.sqlite'));
    resources[resources.length - 1].store = reopened;
    const restored = new CourseService(reopened).get(c.id);
    expect(restored).toMatchObject({ phase: 'detail', currentNodeId: 'real-needs' });
    expect(restored.messages).toHaveLength(2);
    expect(restored.resumeQuestion).toContain('区分问题和方案');
  });
  it('模型回复或用户谈论下一节不推进，重试不重复消息', async () => {
    const { store, courses, c } = setup();
    const model = new FakeModel();
    const chat = new ChatService(store, model);
    await chat.send(c.id, 'q1', '讲讲下一节');
    await chat.send(c.id, 'q1', '讲讲下一节');
    expect(courses.get(c.id)).toMatchObject({ phase: 'overview', version: 0, progress: 0 });
    expect(courses.get(c.id).messages).toHaveLength(2);
    expect(model.requests).toHaveLength(1);
  });
  it('模型失败保留问题，同请求可重试，不改变进度', async () => {
    const { store, courses, c } = setup();
    let fail = true;
    const model: Model = {
      async complete() {
        if (fail) throw new Error('network');
        return '恢复的回答';
      },
    };
    const chat = new ChatService(store, model);
    await expect(chat.send(c.id, 'q1', '我的问题')).rejects.toThrow();
    expect(courses.get(c.id).messages).toHaveLength(1);
    fail = false;
    await chat.send(c.id, 'q1', '我的问题');
    expect(courses.get(c.id).messages).toHaveLength(2);
    expect(courses.get(c.id).version).toBe(0);
  });
  it('深入阶段按引用取内容，自由讨论保留位置', async () => {
    const { store, courses, c } = setup();
    courses.advance(c.id, 'a', 0);
    const model = new FakeModel();
    await new ChatService(store, model).send(c.id, 'q', '回到刚才的问题');
    const prompt = model.requests[0].map((m) => m.content).join('\n');
    expect(prompt).toContain('real-needs');
    expect(prompt).toContain('用户希望增加导出按钮');
    expect(courses.get(c.id).currentNodeId).toBe('real-needs');
  });
  it('教练提示要求先直接回答，不用固定追问模板', async () => {
    const { store, c } = setup();
    const model = new FakeModel();
    await new ChatService(store, model).send(c.id, 'q', '价值交换是什么？');
    const instruction = model.requests[0][0].content;
    expect(instruction).toContain('首要任务是回应用户此刻真正问的问题');
    expect(instruction).toContain('不要机械复述用户原话');
    expect(instruction).toContain('不懂”“都不会”时，从零讲解');
  });
  it('无效导入不保存任何课程', () => {
    const { courses } = setup();
    expect(() =>
      courses.create('坏课程', framework.replace('needs-example -->', 'missing -->'), materials),
    ).toThrow();
    expect(courses.list()).toHaveLength(1);
  });
});
describe('并发与上下文边界', () => {
  it('生成中拒绝同课程并发与推进，另一课程可独立运行', async () => {
    const { store, courses, c } = setup();
    const other = courses.create('独立课程', framework, materials);
    let resolve!: (text: string) => void;
    const deferred = new Promise<string>((r) => {
      resolve = r;
    });
    const model: Model = {
      async complete() {
        return deferred;
      },
    };
    const chat = new ChatService(store, model);
    const first = chat.send(c.id, 'q1', '问题一');
    await expect(chat.send(c.id, 'q2', '问题二')).rejects.toThrow(/正在生成/);
    expect(() => courses.advance(c.id, 'a', 0)).toThrow(/等待/);
    const second = chat.send(other.id, 'q3', '另一个问题');
    resolve('回答');
    await Promise.all([first, second]);
    expect(courses.get(c.id).messages).toHaveLength(2);
    expect(courses.get(other.id).messages).toHaveLength(2);
  });
  it('SQLite 拒绝跨课程引用，失败事务回滚', () => {
    const { store, courses, c } = setup();
    const other = courses.create('独立课程', framework, materials);
    store.db
      .prepare('INSERT INTO material_blocks VALUES(?,?,?,?,?)')
      .run(other.id, 'private', '私有', '内容', '来源');
    expect(() =>
      store.transaction(() => {
        store.db
          .prepare('INSERT INTO node_material_refs VALUES(?,?,?,?)')
          .run(c.id, 'real-needs', 'private', 9);
      }),
    ).toThrow();
    expect(
      store.db
        .prepare("SELECT 1 FROM node_material_refs WHERE course_id=? AND material_id='private'")
        .get(c.id),
    ).toBeUndefined();
  });
  it('超长资料有覆盖提示，历史原文不因上下文限制被删除', async () => {
    const { store, courses, c } = setup();
    store.db
      .prepare("UPDATE material_blocks SET body=? WHERE course_id=? AND material_id='intro'")
      .run('超长内容'.repeat(10000), c.id);
    const model = new FakeModel();
    await new ChatService(store, model).send(c.id, 'q1', '问题');
    const prompt = model.requests[0];
    expect(prompt[0].content).toContain('资料覆盖限制');
    expect(prompt.reduce((n, m) => n + Buffer.byteLength(m.content), 0)).toBeLessThanOrEqual(24000);
    expect(courses.get(c.id).messages).toHaveLength(2);
  });
});
