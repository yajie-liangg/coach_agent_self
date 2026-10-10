import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SqliteStore } from '../../apps/server/src/infrastructure/store.js';
import { CourseService } from '../../apps/server/src/features/courses.js';
import { ChatService } from '../../apps/server/src/features/chat.js';
it('长对话生成课程摘要并在下一轮提供，不改变结构化位置', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const courses = new CourseService(store);
    const c = courses.create(
      '记忆课程',
      readFileSync('tests/fixtures/framework.md', 'utf8'),
      readFileSync('tests/fixtures/materials.md', 'utf8'),
    );
    let summaryCalls = 0;
    const prompts: string[] = [];
    const chat = new ChatService(store, {
      async complete(messages) {
        if (messages[0].content.includes('课程记忆整理器')) {
          summaryCalls++;
          return '用户喜欢先理解整体，尚有需求定义疑问。';
        }
        prompts.push(messages.map((m) => m.content).join('\n'));
        return '继续提问';
      },
    });
    for (let i = 0; i < 9; i++) await chat.send(c.id, 'q' + i, '第' + i + '个问题');
    expect(summaryCalls).toBeGreaterThan(0);
    expect(prompts.at(-1)).toContain('用户喜欢先理解整体');
    expect(courses.get(c.id)).toMatchObject({ phase: 'overview', version: 0, progress: 0 });
    expect(courses.get(c.id).messages).toHaveLength(18);
  } finally {
    store.close();
  }
});
it('摘要调用失败不丢失历史，也不阻断后续正常回答', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const courses = new CourseService(store);
    const c = courses.create(
      '记忆课程',
      readFileSync('tests/fixtures/framework.md', 'utf8'),
      readFileSync('tests/fixtures/materials.md', 'utf8'),
    );
    const chat = new ChatService(store, {
      async complete(messages) {
        if (messages[0].content.includes('课程记忆整理器')) throw new Error('summary unavailable');
        return '正常回答';
      },
    });
    for (let i = 0; i < 8; i++) await chat.send(c.id, 'q' + i, '问题');
    expect(courses.get(c.id).messages).toHaveLength(16);
  } finally {
    store.close();
  }
});
