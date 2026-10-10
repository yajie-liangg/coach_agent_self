import type { CourseOutlineNode, CourseView } from '../../../../packages/contracts/course.js';
import { ApiError, type CoachClient, type CourseList, type Session } from './client.js';

const STORAGE_KEY = 'coach-static-demo-courses-v2';
const LESSONS = [
  ['product-value-system', '产品是解决问题的价值系统'],
  ['value-exchange', '价值交换、成本与约束'],
  ['system-evolution', '系统思维与产品演化'],
  ['market-opportunity', '市场机会与竞争判断'],
  ['positioning-strategy', '定位、选择与产品战略'],
] as const;

const DEMO_OUTLINE: CourseOutlineNode[] = [
  {
    id: 'product-worldview',
    title: '第一部分 建立产品世界观',
    type: 'section',
    parentId: 'overview',
    body: '先理解产品怎样创造价值，以及市场、战略和商业模式如何约束产品选择。',
  },
  {
    id: 'users-and-needs',
    title: '第二部分 理解用户与需求',
    type: 'section',
    parentId: 'overview',
    body: '从用户、场景与行为出发，学习研究证据、识别真实问题并排列需求。',
  },
  {
    id: 'define-and-design',
    title: '第三部分 从问题到体验方案',
    type: 'section',
    parentId: 'overview',
    body: '把问题转成可验证的产品假设、信息结构、任务流程与整体体验。',
  },
  {
    id: 'deliver-with-technology',
    title: '第四部分 把方案可靠地交付',
    type: 'section',
    parentId: 'overview',
    body: '用文档、协作、项目管理和必要的技术理解让方案稳定落地。',
  },
  {
    id: 'verify-and-grow',
    title: '第五部分 用证据迭代与增长',
    type: 'section',
    parentId: 'overview',
    body: '建立指标和实验闭环，再理解运营、增长与传播怎样放大真实价值。',
  },
  {
    id: 'complex-domains',
    title: '第六部分 进入复杂业务场景',
    type: 'section',
    parentId: 'overview',
    body: '把通用方法放进 B 端、电商、数据、广告、游戏和社交等具体系统。',
  },
  {
    id: 'organization-and-career',
    title: '第七部分 组织产品工作与个人成长',
    type: 'section',
    parentId: 'overview',
    body: '理解组织治理、团队影响、工作方法和产品经理的职业成长。',
  },
];

const OVERVIEW_ANSWER = `先把整套知识看成一条产品价值链：

1. **建立产品世界观**：理解产品、价值交换、市场与战略。
2. **理解用户与需求**：找到谁在什么场景下遇到了什么问题。
3. **从问题到体验方案**：把判断转成可验证的产品方案。
4. **把方案可靠地交付**：通过协作、技术和项目管理真正落地。
5. **用证据迭代与增长**：观察结果，持续调整并放大有效价值。
6. **进入复杂业务场景**：把通用方法应用到 B 端、电商等领域。
7. **组织与个人成长**：让产品工作在团队和职业发展中长期运转。

它们不是七组孤立知识，而是“发现价值 → 定义价值 → 交付价值 → 验证并扩大价值”的连续过程。我们可以先在这个层面自由讨论，等你觉得整体关系清楚了，再点击“开始深入”。`;

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
    outline: DEMO_OUTLINE,
    messages: [],
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
    return this.courses.map(({ messages: _messages, outline: _outline, ...course }) => course);
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
    let answer = OVERVIEW_ANSWER;
    if (/价值交换/.test(content))
      answer = `**价值交换**是产品存在的基础：用户愿意付出一些东西，来换取对自己有价值的结果。

用户付出的不只是钱，也可能是时间、注意力、数据、学习成本或改变习惯的成本；用户得到的可能是效率、便利、体验、身份认同或风险降低。企业则投入研发、运营和服务成本，希望获得收入、增长或长期竞争力。

例如打车软件中，乘客付出费用和个人信息，换取更快找到车辆与行程确定性；平台和司机提供匹配与运力，换取佣金和收入。产品经理要判断这组交换对各方是否都能长期成立。

它位于大框架第一部分，是连接“用户问题”和“商业模式”的桥梁。`;
    else if (/^(都没有|不懂|不知道|都不会)[。！!？?\s]*$/.test(content.trim()))
      answer = `没关系，我们就从零开始，不需要先证明自己懂什么。

先记住一条主线：产品经理先理解 **谁遇到了什么问题**，再判断 **解决它能创造什么价值**，然后设计并交付方案，最后用真实结果验证。上面的大框架就是沿着这条主线展开的。

你现在可以随便问其中任何一个词，我会直接解释；等整体轮廓清楚后，我们再进入第一部分。`;
    else if (!/框架|全貌|整体|结构/.test(content) && course.phase === 'overview')
      answer = `你问到的是：“${content.slice(0, 80)}”。在整体阶段，我们可以直接围绕它讨论，不需要先做测试或回答固定问题。

从产品工作的主线看，它需要放回四个关系中理解：面对的用户问题是什么、创造了什么价值、方案如何实现、最后用什么结果验证。具体落在哪一部分，要看你说的实际语境。`;
    else if (course.phase === 'detail')
      answer = `我们现在位于 **${course.currentTitle}**。你提到“${content.slice(0, 80)}”，我会先沿这个问题展开，不要求你按固定句式回答。

这个节点的核心是把概念放回真实的用户、场景和约束中判断，而不是背一个标准定义。`;
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
      content: answer,
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
