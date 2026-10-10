export type Phase = 'overview' | 'detail' | 'finished';
export interface ChatMessage {
  id: string;
  requestId: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'pending' | 'complete' | 'failed';
  createdAt: string;
}
export interface CourseView {
  id: string;
  name: string;
  phase: Phase;
  currentNodeId: string;
  currentTitle: string;
  version: number;
  completed: number;
  total: number;
  progress: number;
  resumeQuestion: string;
  messages: ChatMessage[];
}
