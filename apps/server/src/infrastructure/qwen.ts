import { AppError } from '../features/types.js';
import type { Model, ModelMessage } from '../features/model.js';
interface QwenConfig {
  apiKey?: string;
  model: string;
  baseUrl: string;
  timeoutMs?: number;
}
/** OpenAI-compatible BaiLian adapter. Errors intentionally omit raw provider bodies. */
export class QwenModel implements Model {
  constructor(
    private config: QwenConfig,
    private fetcher: typeof fetch = fetch,
  ) {
    const url = new URL(config.baseUrl);
    if (url.protocol !== 'https:') throw new Error('百炼 API 必须使用 HTTPS');
  }
  async complete(messages: ModelMessage[]): Promise<string> {
    if (!this.config.apiKey)
      throw new AppError('百炼 API Key 尚未配置，请在服务器设置 DASHSCOPE_API_KEY', 503);
    try {
      const response = await this.fetcher(
        `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.config.model,
            messages,
            max_tokens: 1200,
            temperature: 0.65,
            enable_thinking: false,
          }),
          signal: AbortSignal.timeout(this.config.timeoutMs ?? 60000),
        },
      );
      if (!response.ok) {
        if (response.status === 401 || response.status === 403)
          throw new AppError('百炼认证失败，请检查服务端 Key 与区域设置', 502);
        if (response.status === 429) throw new AppError('百炼调用达到限制，请稍后重试', 502);
        throw new AppError('百炼服务暂时不可用，请重试', 502);
      }
      const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const answer = data.choices?.[0]?.message?.content;
      if (typeof answer !== 'string' || !answer.trim())
        throw new AppError('百炼未返回有效回答，请重试', 502);
      return answer;
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError('百炼请求超时或网络不可用，请重试', 502);
    }
  }
}
/** Explicitly enabled only in local smoke/e2e tests; never presented as a real model. */
export class DemoModel implements Model {
  async complete(messages: ModelMessage[]) {
    const state = messages[0].content.match(/当前阶段：([^；]+)/)?.[1];
    return `[测试模型，非百炼] ${state === 'overview' ? '我们先看整个框架，各部分之间有什么联系？' : '请用自己的话解释当前知识点。'}\n\n你的回答不会自动改变进度；准备好后可以点击下一步。`;
  }
}
