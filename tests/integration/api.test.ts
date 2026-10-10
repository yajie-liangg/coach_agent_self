import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildApp } from '../../apps/server/src/api/app.js';
import { SqliteStore } from '../../apps/server/src/infrastructure/store.js';
import type { FastifyInstance } from 'fastify';
const opened: { app: FastifyInstance; store: SqliteStore }[] = [];
afterEach(async () => {
  for (const x of opened.splice(0)) {
    await x.app.close();
    x.store.close();
  }
});
async function setup() {
  const store = new SqliteStore(':memory:');
  const app = await buildApp({
    store,
    password: 'test-password-long',
    secureCookie: false,
    model: {
      async complete() {
        return '中文模型回答';
      },
    },
  });
  opened.push({ app, store });
  return app;
}
async function login(app: FastifyInstance) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/login',
    payload: { password: 'test-password-long' },
  });
  return res.headers['set-cookie']!.toString().split(';')[0];
}
describe('HTTP 与个人访问保护', () => {
  it('匿名用户不能读课程，错误密码无法登录', async () => {
    const app = await setup();
    expect((await app.inject('/api/courses')).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'bad' } }))
        .statusCode,
    ).toBe(401);
  });
  it('登录后创建、聊天、推进、注销组成真实 HTTP 闭环', async () => {
    const app = await setup();
    const cookie = await login(app);
    const headers = { cookie };
    const created = await app.inject({
      method: 'POST',
      url: '/api/courses',
      headers,
      payload: {
        name: '测试',
        framework: readFileSync('tests/fixtures/framework.md', 'utf8'),
        materials: readFileSync('tests/fixtures/materials.md', 'utf8'),
      },
    });
    expect(created.statusCode).toBe(201);
    const c = created.json();
    const answer = await app.inject({
      method: 'POST',
      url: `/api/courses/${c.id}/messages`,
      headers,
      payload: { requestId: 'q1', content: '你好' },
    });
    expect(answer.json().messages[1].content).toBe('中文模型回答');
    const next = await app.inject({
      method: 'POST',
      url: `/api/courses/${c.id}/advance`,
      headers,
      payload: { operationId: 'a1', version: 0 },
    });
    expect(next.json().phase).toBe('detail');
    await app.inject({ method: 'POST', url: '/api/logout', headers, payload: {} });
    expect((await app.inject({ url: '/api/courses', headers })).statusCode).toBe(401);
  });
  it('拒绝跨站状态操作和危险参数，错误不泄露密钥', async () => {
    const app = await setup();
    const cookie = await login(app);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/logout',
          headers: { cookie, origin: 'https://evil.example' },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    const res = await app.inject({
      method: 'POST',
      url: '/api/courses',
      headers: { cookie },
      payload: { name: 1 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain('test-password-long');
  });
});
