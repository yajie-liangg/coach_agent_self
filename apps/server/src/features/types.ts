export type { Phase, ChatMessage, CourseView } from '../../../../packages/contracts/course.js';
export interface FrameworkNode {
  id: string;
  title: string;
  type: 'overview' | 'section' | 'lesson';
  parentId: string | null;
  position: number;
  body: string;
  refs: string[];
}
export interface MaterialBlock {
  id: string;
  title: string;
  body: string;
  sourceRef: string;
}
export interface ParsedCourse {
  framework: string;
  materials: string;
  nodes: FrameworkNode[];
  blocks: MaterialBlock[];
}
/** HTTP-facing errors never include provider responses or secrets. */
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
