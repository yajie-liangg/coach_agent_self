export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
export interface Model {
  complete(messages: ModelMessage[]): Promise<string>;
}
