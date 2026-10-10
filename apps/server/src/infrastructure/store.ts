import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import type { LearningRepository, StoredCourse, MemoryEntry } from '../features/repository.js';
import type { ParsedCourse, Phase, MaterialBlock, ChatMessage } from '../features/types.js';
/** Owns the database connection and explicit transaction boundary; callers own business rules. */
export class SqliteStore implements LearningRepository {
  readonly db: DatabaseSync;
  private closed = false;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    const schemaVersion = Number(this.db.prepare('PRAGMA user_version').get()!.user_version);
    if (schemaVersion > 2) {
      this.db.close();
      throw new Error('数据库版本比应用更新，请使用对应版本，不能降级写入');
    }
    this.db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
    const columns = this.db.prepare('PRAGMA table_info(learning_sessions)').all();
    if (!columns.some((c) => c.name === 'summary_until'))
      this.db.exec(
        'ALTER TABLE learning_sessions ADD COLUMN summary_until INTEGER NOT NULL DEFAULT 0',
      );
    this.db.exec('PRAGMA user_version=2');
    // A killed process leaves no model call running. Make those requests retryable on restart.
    this.db.exec(
      "UPDATE chat_requests SET status='failed' WHERE status='pending'; UPDATE messages SET status='failed' WHERE status='pending';",
    );
  }
  transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  insertCourse(id: string, name: string, parsed: ParsedCourse) {
    this.db.prepare('INSERT INTO courses VALUES(?,?,?)').run(id, name, new Date().toISOString());
    for (const [type, text] of [
      ['framework', parsed.framework],
      ['materials', parsed.materials],
    ])
      this.db
        .prepare('INSERT INTO documents VALUES(?,?,?,?,?,?)')
        .run(
          randomUUID(),
          id,
          type,
          type + '.md',
          text,
          createHash('sha256').update(text).digest('hex'),
        );
    for (const n of parsed.nodes)
      this.db
        .prepare('INSERT INTO framework_nodes VALUES(?,?,?,?,?,?,?)')
        .run(id, n.id, n.parentId, n.title, n.type, n.position, n.body);
    for (const b of parsed.blocks)
      this.db
        .prepare('INSERT INTO material_blocks VALUES(?,?,?,?,?)')
        .run(id, b.id, b.title, b.body, b.sourceRef);
    for (const n of parsed.nodes)
      n.refs.forEach((ref, i) =>
        this.db.prepare('INSERT INTO node_material_refs VALUES(?,?,?,?)').run(id, n.id, ref, i),
      );
    this.db
      .prepare('INSERT INTO learning_sessions(course_id,phase,current_node_id) VALUES(?,?,?)')
      .run(id, 'overview', parsed.nodes[0].id);
  }
  courseIds(): string[] {
    return this.db
      .prepare('SELECT id FROM courses ORDER BY created_at DESC')
      .all()
      .map((r) => String(r.id));
  }
  readCourse(id: string): StoredCourse | undefined {
    const row = this.db
      .prepare(
        `SELECT c.id,c.name,s.phase,s.current_node_id AS currentNodeId,s.state_version AS version,s.resume_question AS resumeQuestion,n.title AS currentTitle FROM courses c JOIN learning_sessions s ON s.course_id=c.id JOIN framework_nodes n ON n.course_id=c.id AND n.node_id=s.current_node_id WHERE c.id=?`,
      )
      .get(id);
    if (!row) return undefined;
    const total = Number(
      this.db
        .prepare(
          "SELECT COUNT(*) AS count FROM framework_nodes WHERE course_id=? AND node_type='lesson'",
        )
        .get(id)!.count,
    );
    const completed = Number(
      this.db.prepare('SELECT COUNT(*) AS count FROM node_progress WHERE course_id=?').get(id)!
        .count,
    );
    const messages = this.db
      .prepare(
        'SELECT id,request_id AS requestId,role,content,status,created_at AS createdAt FROM messages WHERE course_id=? ORDER BY rowid',
      )
      .all(id) as unknown as ChatMessage[];
    return { ...row, total, completed, messages } as StoredCourse;
  }
  advanceVersion(id: string, operation: string) {
    const row = this.db
      .prepare(
        'SELECT expected_version FROM advance_operations WHERE course_id=? AND operation_id=?',
      )
      .get(id, operation);
    return row ? Number(row.expected_version) : undefined;
  }
  hasPendingChat(id: string) {
    return !!this.db
      .prepare("SELECT 1 FROM chat_requests WHERE course_id=? AND status='pending'")
      .get(id);
  }
  lessons(id: string) {
    return this.db
      .prepare(
        "SELECT node_id FROM framework_nodes WHERE course_id=? AND node_type='lesson' ORDER BY position",
      )
      .all(id)
      .map((r) => String(r.node_id));
  }
  confirmNode(id: string, node: string) {
    this.db
      .prepare('INSERT OR IGNORE INTO node_progress VALUES(?,?,?)')
      .run(id, node, new Date().toISOString());
  }
  movePosition(id: string, phase: Phase, node: string) {
    this.db
      .prepare(
        "UPDATE learning_sessions SET phase=?,current_node_id=?,state_version=state_version+1,resume_question='' WHERE course_id=?",
      )
      .run(phase, node, id);
  }
  recordAdvance(id: string, operation: string, version: number) {
    this.db.prepare('INSERT INTO advance_operations VALUES(?,?,?)').run(id, operation, version);
  }
  framework(id: string) {
    return String(
      this.db
        .prepare("SELECT markdown FROM documents WHERE course_id=? AND type='framework'")
        .get(id)!.markdown,
    );
  }
  referencedMaterials(id: string, node: string): MaterialBlock[] {
    return this.db
      .prepare(
        `SELECT b.material_id AS id,b.title,b.body,b.source_ref AS sourceRef FROM node_material_refs r JOIN material_blocks b ON b.course_id=r.course_id AND b.material_id=r.material_id WHERE r.course_id=? AND r.node_id=? ORDER BY r.position`,
      )
      .all(id, node) as unknown as MaterialBlock[];
  }
  message(id: string, request: string, role: 'user' | 'assistant'): ChatMessage | undefined {
    return this.db
      .prepare(
        'SELECT id,request_id AS requestId,role,content,status,created_at AS createdAt FROM messages WHERE course_id=? AND request_id=? AND role=?',
      )
      .get(id, request, role) as unknown as ChatMessage | undefined;
  }
  beginChat(id: string, request: string, content: string) {
    this.db
      .prepare('INSERT OR IGNORE INTO messages VALUES(?,?,?,?,?,?,?)')
      .run(randomUUID(), id, request, 'user', content, 'pending', new Date().toISOString());
    this.db
      .prepare(
        "UPDATE messages SET status='pending' WHERE course_id=? AND request_id=? AND role='user'",
      )
      .run(id, request);
    this.db
      .prepare(
        "INSERT INTO chat_requests VALUES(?,?,'pending') ON CONFLICT(course_id,request_id) DO UPDATE SET status='pending'",
      )
      .run(id, request);
  }
  completeChat(id: string, request: string, answer: string) {
    this.db
      .prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?)')
      .run(randomUUID(), id, request, 'assistant', answer, 'complete', new Date().toISOString());
    this.db
      .prepare("UPDATE messages SET status='complete' WHERE course_id=? AND request_id=?")
      .run(id, request);
    this.db
      .prepare("UPDATE chat_requests SET status='complete' WHERE course_id=? AND request_id=?")
      .run(id, request);
    this.db
      .prepare('UPDATE learning_sessions SET resume_question=? WHERE course_id=?')
      .run(answer, id);
  }
  failChat(id: string, request: string) {
    this.db
      .prepare(
        "UPDATE messages SET status='failed' WHERE course_id=? AND request_id=? AND role='user'",
      )
      .run(id, request);
    this.db
      .prepare("UPDATE chat_requests SET status='failed' WHERE course_id=? AND request_id=?")
      .run(id, request);
  }
  memory(id: string) {
    const row = this.db
      .prepare('SELECT summary,summary_until FROM learning_sessions WHERE course_id=?')
      .get(id)!;
    return { summary: String(row.summary), until: Number(row.summary_until) };
  }
  completeHistory(id: string): MemoryEntry[] {
    return this.db
      .prepare(
        "SELECT rowid AS seq,role,content FROM messages WHERE course_id=? AND status='complete' ORDER BY rowid",
      )
      .all(id) as unknown as MemoryEntry[];
  }
  saveMemory(id: string, summary: string, until: number) {
    this.db
      .prepare('UPDATE learning_sessions SET summary=?,summary_until=? WHERE course_id=?')
      .run(summary, until, id);
  }
  close() {
    if (!this.closed) {
      this.db.close();
      this.closed = true;
    }
  }
}
