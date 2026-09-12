-- 保持旧表及外键不变。负数 repository_id 仅作直传记录的内部兼容占位，绝不传给 GitHub。
ALTER TABLE plugins ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'github' CHECK(source_kind IN ('github','upload'));
ALTER TABLE plugins ADD COLUMN upload_id TEXT;
ALTER TABLE plugins ADD COLUMN submission_key TEXT;
CREATE UNIQUE INDEX plugins_upload_submission ON plugins(submission_key);
CREATE TABLE uploads(id TEXT PRIMARY KEY,plugin_id TEXT NOT NULL REFERENCES plugins(id),object_key TEXT NOT NULL UNIQUE,data TEXT NOT NULL,sha256 TEXT NOT NULL,size INTEGER NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX uploads_plugin ON uploads(plugin_id,created_at);
-- 提交存在性约束：使配额或版本竞争失败原子回滚，不留下半条投稿。
ALTER TABLE tasks ADD COLUMN upload_id TEXT REFERENCES uploads(id) ON DELETE SET NULL;
