import type { CourseView, ParsedCourse, Phase, ChatMessage, MaterialBlock } from './types.js';
export type StoredCourse = Omit<CourseView, 'progress'>;
export interface MemoryEntry {
  seq: number;
  role: string;
  content: string;
}
/** Persistence contract: domain services do not depend on SQLite, SQL, or HTTP. */
export interface LearningRepository {
  transaction<T>(work: () => T): T;
  insertCourse(id: string, name: string, course: ParsedCourse): void;
  courseIds(): string[];
  readCourse(id: string): StoredCourse | undefined;
  advanceVersion(id: string, operation: string): number | undefined;
  hasPendingChat(id: string): boolean;
  lessons(id: string): string[];
  confirmNode(id: string, node: string): void;
  movePosition(id: string, phase: Phase, node: string): void;
  recordAdvance(id: string, operation: string, version: number): void;
  framework(id: string): string;
  referencedMaterials(id: string, node: string): MaterialBlock[];
  message(id: string, request: string, role: 'user' | 'assistant'): ChatMessage | undefined;
  beginChat(id: string, request: string, content: string): void;
  completeChat(id: string, request: string, answer: string): void;
  failChat(id: string, request: string): void;
  memory(id: string): { summary: string; until: number };
  completeHistory(id: string): MemoryEntry[];
  saveMemory(id: string, summary: string, until: number): void;
}
