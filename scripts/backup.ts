import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
if (existsSync('.env')) process.loadEnvFile('.env');
const source = resolve(process.env.COACH_DB_PATH ?? 'data/coach.sqlite');
const destination = process.argv[2];
if (!destination) throw new Error('用法：npm run backup -- /安全目录/coach-backup.sqlite');
if (!existsSync(source)) throw new Error('源数据库不存在');
if (existsSync(destination)) throw new Error('备份目标已存在，拒绝覆盖');
mkdirSync(dirname(resolve(destination)), { recursive: true, mode: 0o700 });
const database = new DatabaseSync(source, { readOnly: true });
try {
  await backup(database, resolve(destination));
  console.log('数据库备份已完成');
} finally {
  database.close();
}
