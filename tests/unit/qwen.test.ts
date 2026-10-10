import { it, expect, vi } from 'vitest';
import { QwenModel } from '../../apps/server/src/infrastructure/qwen.js';
const messages = [{ role: 'user' as const, content: '中文问题' }];
it('百炼兼容接口发送正确参数并读取回答', async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '中文回答' } }] }), {
        status: 200,
      }),
  ) as unknown as typeof fetch;
  const model = new QwenModel(
    {
      apiKey: 'test-secret',
      model: 'qwen-plus',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    },
    fetcher,
  );
  expect(await model.complete(messages)).toBe('中文回答');
  expect(fetcher).toHaveBeenCalledWith(
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    expect.objectContaining({ method: 'POST', body: expect.stringContaining('中文问题') }),
  );
});
it.each([401, 403, 429, 500])('供应商错误 %s 不泄露响应和密钥', async (status) => {
  const fetcher = vi.fn(
    async () => new Response('test-secret upstream internal', { status }),
  ) as unknown as typeof fetch;
  const model = new QwenModel(
    {
      apiKey: 'test-secret',
      model: 'qwen-plus',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    },
    fetcher,
  );
  await expect(model.complete(messages)).rejects.toMatchObject({
    status: 502,
    message: expect.not.stringContaining('test-secret'),
  });
});
it('缺少密钥时报告未配置，不发送网络请求', async () => {
  const fetcher = vi.fn() as unknown as typeof fetch;
  await expect(
    new QwenModel(
      { model: 'qwen-plus', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
      fetcher,
    ).complete(messages),
  ).rejects.toThrow(/尚未配置/);
  expect(fetcher).not.toHaveBeenCalled();
});
