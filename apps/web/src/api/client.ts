import type { CourseView } from '../../../../packages/contracts/course.js';
export type { CourseView };
export type CourseList = Omit<CourseView, 'messages' | 'outline'>[];
export interface Session {
  authenticated: boolean;
  accountName: string;
  demo: boolean;
}
export interface CoachClient {
  session(): Promise<Session>;
  login(password: string): Promise<unknown>;
  logout(): Promise<unknown>;
  list(): Promise<CourseList>;
  course(id: string): Promise<CourseView>;
  create(name: string, framework: string, materials: string): Promise<CourseView>;
  send(id: string, requestId: string, content: string): Promise<CourseView>;
  advance(id: string, operationId: string, version: number): Promise<CourseView>;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
/** Browser client: credentials are opaque HttpOnly cookies, never model keys. */
export class CoachApi implements CoachClient {
  private async request<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new ApiError(data.error ?? '操作失败，请重试', response.status);
    return data as T;
  }
  session() {
    return this.request<Session>('/session');
  }
  login(password: string) {
    return this.request('/login', { password });
  }
  logout() {
    return this.request('/logout', {});
  }
  list() {
    return this.request<CourseList>('/courses');
  }
  course(id: string) {
    return this.request<CourseView>(`/courses/${encodeURIComponent(id)}`);
  }
  create(name: string, framework: string, materials: string) {
    return this.request<CourseView>('/courses', { name, framework, materials });
  }
  send(id: string, requestId: string, content: string) {
    return this.request<CourseView>(`/courses/${encodeURIComponent(id)}/messages`, {
      requestId,
      content,
    });
  }
  advance(id: string, operationId: string, version: number) {
    return this.request<CourseView>(`/courses/${encodeURIComponent(id)}/advance`, {
      operationId,
      version,
    });
  }
}
