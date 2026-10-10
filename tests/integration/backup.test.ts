import { it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { SqliteStore } from '../../apps/server/src/infrastructure/store.js';
import { CourseService } from '../../apps/server/src/features/courses.js';
it('实际备份脚本生成可恢复的课程数据库且拒绝覆盖', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coach-backup-'));
  const source = join(dir, 'source.sqlite');
  const destination = join(dir, 'backup.sqlite');
  try {
    const original = new SqliteStore(source);
    const course = new CourseService(original).create(
      '备份课程',
      readFileSync('tests/fixtures/framework.md', 'utf8'),
      readFileSync('tests/fixtures/materials.md', 'utf8'),
    );
    new CourseService(original).advance(course.id, 'a', 0);
    original.close();
    const args = ['--import', 'tsx', 'scripts/backup.ts', destination];
    const options = { env: { ...process.env, COACH_DB_PATH: source }, stdio: 'pipe' as const };
    execFileSync(process.execPath, args, options);
    const restored = new SqliteStore(destination);
    try {
      expect(new CourseService(restored).get(course.id)).toMatchObject({
        name: '备份课程',
        phase: 'detail',
      });
      expect(restored.db.prepare('SELECT COUNT(*) AS n FROM node_material_refs').get()!.n).toBe(5);
    } finally {
      restored.close();
    }
    expect(() => execFileSync(process.execPath, args, options)).toThrow();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
