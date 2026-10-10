-- Base schema; schema version upgrades are applied by SqliteStore.
PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
   CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id),
  type TEXT NOT NULL,
  filename TEXT NOT NULL,
  markdown TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  UNIQUE(course_id,type)
);
   CREATE TABLE IF NOT EXISTS framework_nodes (
  course_id TEXT NOT NULL REFERENCES courses(id),
  node_id TEXT NOT NULL,
  parent_node_id TEXT,
  title TEXT NOT NULL,
  node_type TEXT NOT NULL,
  position INTEGER NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY(course_id,node_id),
  FOREIGN KEY(course_id,parent_node_id) REFERENCES framework_nodes(course_id,node_id)
);
   CREATE TABLE IF NOT EXISTS material_blocks (
  course_id TEXT NOT NULL REFERENCES courses(id),
  material_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  PRIMARY KEY(course_id,material_id)
);
   CREATE TABLE IF NOT EXISTS node_material_refs (
  course_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  material_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY(course_id,node_id,material_id),
  FOREIGN KEY(course_id,node_id) REFERENCES framework_nodes(course_id,node_id),
  FOREIGN KEY(course_id,material_id) REFERENCES material_blocks(course_id,material_id)
);
   CREATE TABLE IF NOT EXISTS learning_sessions (
  course_id TEXT PRIMARY KEY REFERENCES courses(id),
  phase TEXT NOT NULL,
  current_node_id TEXT NOT NULL,
  resume_question TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  state_version INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(course_id,current_node_id) REFERENCES framework_nodes(course_id,node_id)
);
   CREATE TABLE IF NOT EXISTS node_progress (
  course_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  PRIMARY KEY(course_id,node_id),
  FOREIGN KEY(course_id,node_id) REFERENCES framework_nodes(course_id,node_id)
);
   CREATE TABLE IF NOT EXISTS advance_operations (
  course_id TEXT NOT NULL REFERENCES courses(id),
  operation_id TEXT NOT NULL,
  expected_version INTEGER NOT NULL,
  PRIMARY KEY(course_id,operation_id)
);
   CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id),
  request_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(course_id,request_id,role)
);
   CREATE TABLE IF NOT EXISTS chat_requests (
  course_id TEXT NOT NULL REFERENCES courses(id),
  request_id TEXT NOT NULL,
  status TEXT NOT NULL,
  PRIMARY KEY(course_id,request_id)
);
   CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
   CREATE INDEX IF NOT EXISTS message_course_order ON messages(course_id,
  created_at,
  id);
