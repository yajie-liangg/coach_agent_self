import { beforeEach, describe, expect, it } from 'vitest';
import { DemoCoachApi } from '../../apps/web/src/api/demo.js';

describe('电脑端静态试用 API', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        value: '',
        getItem() {
          return this.value || null;
        },
        setItem(_key: string, value: string) {
          this.value = value;
        },
      },
    });
  });

  it('提供预置课程、演示问答和用户确认推进', async () => {
    const api = new DemoCoachApi();
    const [summary] = await api.list();
    expect(summary.name).toBe('产品经理教练');
    expect((await api.course(summary.id)).outline).toHaveLength(7);

    const discussed = await api.send(summary.id, 'request-1', '价值交换是什么？');
    expect(discussed.messages.at(-1)?.role).toBe('assistant');
    expect(discussed.messages.at(-1)?.content).toContain('用户付出的不只是钱');
    expect(discussed.messages.at(-1)?.content).not.toContain('你目前最有把握');

    const advanced = await api.advance(summary.id, 'operation-1', discussed.version);
    expect(advanced).toMatchObject({
      phase: 'detail',
      currentNodeId: 'product-value-system',
      completed: 0,
    });
  });
});
