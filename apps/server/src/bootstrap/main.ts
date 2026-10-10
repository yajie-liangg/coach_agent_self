import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { SqliteStore } from '../infrastructure/store.js';
import { QwenModel, DemoModel } from '../infrastructure/qwen.js';
import { buildApp } from '../api/app.js';
if (existsSync('.env')) process.loadEnvFile('.env');
const password = process.env.COACH_PASSWORD;
if (!password) throw new Error('请在 .env 或服务端环境变量设置 COACH_PASSWORD（至少 12 字符）');
const demo = process.env.COACH_DEMO_MODEL === '1';
const host = process.env.HOST ?? '127.0.0.1';
if (demo && !['127.0.0.1', 'localhost', '::1'].includes(host))
  throw new Error('测试模型只允许绑定本机地址');
const secureCookie = process.env.COACH_SECURE_COOKIE !== 'false';
const store = new SqliteStore(process.env.COACH_DB_PATH ?? 'data/coach.sqlite');
const model = demo
  ? new DemoModel()
  : new QwenModel({
      apiKey: process.env.DASHSCOPE_API_KEY,
      model: process.env.QWEN_MODEL ?? 'qwen-plus',
      baseUrl: process.env.QWEN_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });
const app = await buildApp({
  store,
  password,
  model,
  secureCookie,
  accountName: process.env.COACH_ACCOUNT_NAME,
  staticRoot: resolve('dist/web'),
  demo,
});
await app.listen({ port: Number(process.env.PORT ?? 3000), host });
console.log(`Coach 服务已启动，端口 ${process.env.PORT ?? 3000}${demo ? '（测试模型）' : ''}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, async () => {
    await app.close();
    store.close();
    process.exit(0);
  });
