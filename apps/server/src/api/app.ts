import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { SqliteStore } from '../infrastructure/store.js';
import { AuthService } from '../infrastructure/auth.js';
import { CourseService } from '../features/courses.js';
import { ChatService } from '../features/chat.js';
import { AppError } from '../features/types.js';
import type { Model } from '../features/model.js';
interface Options {
  store: SqliteStore;
  password: string;
  model: Model;
  secureCookie: boolean;
  accountName?: string;
  staticRoot?: string;
  demo?: boolean;
}
const text = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength });
const object = (properties: Record<string, object>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
export async function buildApp(options: Options) {
  const app = Fastify({
    bodyLimit: 3 * 1024 * 1024,
    logger: false,
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  const auth = new AuthService(options.store, options.password);
  const courses = new CourseService(options.store);
  const chat = new ChatService(options.store, options.model);
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof AppError) return reply.code(err.status).send({ error: err.message });
    const failure = err as { validation?: unknown; statusCode?: number };
    if (failure.validation) return reply.code(400).send({ error: '请求格式无效，请检查输入' });
    if (failure.statusCode === 429)
      return reply.code(429).send({ error: '操作太频繁，请稍后再试' });
    if (failure.statusCode === 413)
      return reply.code(413).send({ error: '上传内容过大，每份文件最大 1 MB' });
    return reply.code(500).send({ error: '服务暂时无法完成操作，请重试' });
  });
  app.addHook('onRequest', async (req, reply) => {
    reply
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'same-origin')
      .header(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
    if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin) {
        try {
          if (new URL(origin).host !== req.headers.host) throw new Error();
        } catch {
          throw new AppError('不允许跨站操作', 403);
        }
      }
    }
    const pathname = req.url.split('?')[0];
    if (
      pathname.startsWith('/api/') &&
      !['/api/login', '/api/session', '/api/health'].includes(pathname) &&
      !auth.valid(req.cookies.coach_session)
    )
      throw new AppError('请先登录', 401);
  });
  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/session', async (req) => ({
    authenticated: auth.valid(req.cookies.coach_session),
    accountName: options.accountName ?? '个人账号',
    demo: !!options.demo,
  }));
  app.post<{ Body: { password: string } }>(
    '/api/login',
    {
      config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
      schema: { body: object({ password: text(256) }) },
    },
    async (req, reply) => {
      const token = auth.login(req.body.password);
      if (!token) throw new AppError('密码不正确', 401);
      reply.setCookie('coach_session', token, {
        path: '/',
        httpOnly: true,
        secure: options.secureCookie,
        sameSite: 'strict',
        maxAge: 7 * 86400,
      });
      return { authenticated: true };
    },
  );
  app.post('/api/logout', async (req, reply) => {
    auth.logout(req.cookies.coach_session);
    reply.clearCookie('coach_session', { path: '/' });
    return { ok: true };
  });
  app.get('/api/courses', async () => courses.list());
  app.post<{ Body: { name: string; framework: string; materials: string } }>(
    '/api/courses',
    {
      schema: {
        body: object({
          name: text(100),
          framework: text(1024 * 1024),
          materials: text(1024 * 1024),
        }),
      },
    },
    async (req, reply) => {
      reply.code(201);
      return courses.create(req.body.name, req.body.framework, req.body.materials);
    },
  );
  app.get<{ Params: { id: string } }>('/api/courses/:id', async (req) =>
    courses.get(req.params.id),
  );
  app.post<{ Params: { id: string }; Body: { operationId: string; version: number } }>(
    '/api/courses/:id/advance',
    {
      schema: {
        body: object({ operationId: text(100), version: { type: 'integer', minimum: 0 } }),
      },
    },
    async (req) => courses.advance(req.params.id, req.body.operationId, req.body.version),
  );
  app.post<{ Params: { id: string }; Body: { requestId: string; content: string } }>(
    '/api/courses/:id/messages',
    { schema: { body: object({ requestId: text(100), content: text(2000) }) } },
    async (req) => chat.send(req.params.id, req.body.requestId, req.body.content),
  );
  if (options.staticRoot && existsSync(join(options.staticRoot, 'index.html'))) {
    await app.register(staticFiles, { root: options.staticRoot });
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: '接口不存在' });
      return reply.sendFile('index.html');
    });
  }
  return app;
}
