import type { CourseView } from '../../../../packages/contracts/course.js';
import { ApiError, type CoachClient, type CourseList, type Session } from './client.js';

const STORAGE_KEY = 'coach-static-demo-courses';
const LESSONS = [
  ['product-value-system', '产品是解决问题的价值系统'],
  ['value-exchange', '价值交换、成本与约束'],
  ['system-evolution', '系统思维与产品演化'],
  ['market-opportunity', '市场机会与竞争判断'],
  ['positioning-strategy', '定位、选择与产品战略'],
] as const;

function initialCourse(): CourseView {
  return {
    id: 'product-manager-coach',
    name: '产品经理教练',
    phase: 'overview',
    currentNodeId: 'overview',
    currentTitle: '产品经理跨书知识体系',
    version: 1,
    completed: 0,
    total: LESSONS.length,
    progress: 0,
    resumeQuestion: '你想先理解整套框架，还是从一个熟悉的产品问题进入？',
    messages: [
      {
        id: 'welcome',
        requestId: 'welcome',
        role: 'assistant',
        status: 'complete',
        createdAt: new Date().toISOString(),
        content:
          '我们会从 **产品世界观** 开始，再进入用户与需求、方案设计、交付、数据增长和组织能力。\n\n先不用记细节：你认为产品经理最核心的工作是什么？',
      },
    ],
  };
}

/** Browser-only API used by the public UI preview. It never calls a model or server. */
export class DemoCoachApi implements CoachClient {
  private authenticated = true;
  private courses = this.restore();

  private restore(): CourseView[] {
    try {
      const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved) as CourseView[];
    } catch {}
    return [initialCourse()];
  }

  private persist() {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(this.courses));
    } catch {}
  }

  private find(id: string) {
    const course = this.courses.find((item) => item.id === id);
    if (!course) throw new ApiError('课程不存在', 404);
    return course;
  }

  async session(): Promise<Session> {
    return { authenticated: this.authenticated, accountName: 'LYJ', demo: true };
  }

  async login(_password: string) {
    this.authenticated = true;
    return {};
  }

  async logout() {
    this.authenticated = false;
    return {};
  }

  async list(): Promise<CourseList> {
    return this.courses.map(({ messages: _messages, ...course }) => course);
  }

  async course(id: string) {
    return structuredClone(this.find(id));
  }

  async create(name: string, _framework: string, _materials: string) {
    const course = initialCourse();
    course.id = crypto.randomUUID();
    course.name = name;
    course.messages = [];
    this.courses.unshift(course);
    this.persist();
    return structuredClone(course);
  }

  async send(id: string, requestId: string, content: string) {
    const course = this.find(id);
    const createdAt = new Date().toISOString();
    course.messages.push({
      id: crypto.randomUUID(),
      requestId,
      role: 'user',
      content,
      status: 'complete',
      createdAt,
    });
    course.messages.push({
      id: crypto.randomUUID(),
      requestId,
      role: 'assistant',
      status: 'complete',
      createdAt,
      content:
        course.phase === 'overview'
          ? `我听到你的理解是：“${content.slice(0, 80)}”。\n\n先把它放回大框架：产品工作连接 **用户问题、价值交换、可行方案和结果验证**。这四部分里，你目前最有把握的是哪一部分？`
          : `你把这个节点联系到了：“${content.slice(0, 80)}”。\n\n继续追问一步：如果要证明这个判断成立，你会观察什么用户行为或结果？`,
    });
    course.version += 1;
    this.persist();
    return structuredClone(course);
  }

  async advance(id: string, _operationId: string, version: number) {
    const course = this.find(id);
    if (course.version !== version) throw new ApiError('学习状态已更新，请重试', 409);
    if (course.phase === 'overview') {
      course.phase = 'detail';
      course.currentNodeId = LESSONS[0][0];
      course.currentTitle = LESSONS[0][1];
    } else if (course.phase === 'detail') {
      course.completed = Math.min(course.completed + 1, course.total);
      course.progress = Math.floor((course.completed / course.total) * 100);
      const next = LESSONS[course.completed];
      if (next) {
        course.currentNodeId = next[0];
        course.currentTitle = next[1];
      } else {
        course.phase = 'finished';
        course.currentTitle = '框架学习已完成';
      }
    }
    course.version += 1;
    this.persist();
    return structuredClone(course);
  }
}
