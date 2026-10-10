import { randomUUID } from 'node:crypto';
import type { LearningRepository } from './repository.js';
import { MarkdownImporter } from './materials.js';
import { AppError, type CourseView, type Phase } from './types.js';
/** Coordinates course import and explicit user-controlled progress. */
export class CourseService {
  constructor(
    private store: LearningRepository,
    private importer = new MarkdownImporter(),
  ) {}
  create(name: string, framework: string, materials: string): CourseView {
    if (!name.trim() || name.trim().length > 100) throw new AppError('课程名称需为 1–100 字');
    if (Buffer.byteLength(framework) > 1024 * 1024 || Buffer.byteLength(materials) > 1024 * 1024)
      throw new AppError('每个 MD 文件最大 1 MB');
    const parsed = this.importer.parse(framework, materials);
    const id = randomUUID();
    this.store.transaction(() => this.store.insertCourse(id, name.trim(), parsed));
    return this.get(id);
  }
  list(): Omit<CourseView, 'messages'>[] {
    return this.store.courseIds().map((id) => {
      const { messages, ...course } = this.get(id);
      return course;
    });
  }
  get(id: string): CourseView {
    const stored = this.store.readCourse(id);
    if (!stored) throw new AppError('课程不存在', 404);
    return { ...stored, progress: Math.floor((stored.completed / stored.total) * 100) };
  }
  advance(id: string, operationId: string, expectedVersion: number): CourseView {
    this.store.transaction(() => {
      const state = this.get(id);
      const previous = this.store.advanceVersion(id, operationId);
      if (previous !== undefined) {
        if (previous !== expectedVersion) throw new AppError('操作编号已被使用', 409);
        return;
      }
      if (state.version !== expectedVersion) throw new AppError('状态已更新，请刷新后重试', 409);
      if (state.phase === 'finished') throw new AppError('课程已完成，仍可继续讨论', 409);
      if (this.store.hasPendingChat(id)) throw new AppError('请等待当前回答完成', 409);
      const lessons = this.store.lessons(id);
      let next = lessons[0];
      let phase: Phase = 'detail';
      if (state.phase === 'detail') {
        this.store.confirmNode(id, state.currentNodeId);
        const index = lessons.indexOf(state.currentNodeId);
        next = lessons[index + 1] ?? state.currentNodeId;
        phase = index === lessons.length - 1 ? 'finished' : 'detail';
      }
      this.store.movePosition(id, phase, next);
      this.store.recordAdvance(id, operationId, expectedVersion);
    });
    return this.get(id);
  }
}
