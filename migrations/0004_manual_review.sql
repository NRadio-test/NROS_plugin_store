CREATE TABLE manual_reviews (
  id TEXT PRIMARY KEY,
  plugin_id TEXT NOT NULL REFERENCES plugins(id),
  revision INTEGER NOT NULL,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  decision TEXT NOT NULL DEFAULT 'pending' CHECK(decision IN ('pending','approved','rejected')),
  public_reason TEXT NOT NULL DEFAULT '等待管理员人工审核',
  internal_reason TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT,
  decision_token TEXT,
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  UNIQUE(plugin_id,revision)
);
CREATE INDEX manual_reviews_queue ON manual_reviews(decision,created_at);

-- Existing publications become candidates; keep files, favorites and ownership intact.
INSERT INTO manual_reviews(id,plugin_id,revision,snapshot_id,created_at)
SELECT lower(hex(randomblob(16))),p.id,p.revision,s.id,CAST(strftime('%s','now') AS INTEGER)*1000
FROM plugins p JOIN snapshots s ON s.id=p.approved_snapshot_id
WHERE p.status='published' AND p.blocked=0;
UPDATE tasks SET status='awaiting_review',lock_token=NULL,lock_until=NULL,
  public_reason='旧版本等待管理员重新人工审核'
WHERE EXISTS(SELECT 1 FROM manual_reviews r WHERE r.plugin_id=tasks.plugin_id AND r.revision=tasks.revision);
INSERT OR IGNORE INTO tasks(id,plugin_id,revision,status,public_reason,created_at,updated_at)
SELECT lower(hex(randomblob(16))),plugin_id,revision,'awaiting_review','旧版本等待管理员重新人工审核',created_at,created_at FROM manual_reviews;
UPDATE plugins SET status='awaiting_review',approved_snapshot_id=NULL,
  public_reason='旧版本等待管理员重新人工审核',checked_at=NULL
WHERE EXISTS(SELECT 1 FROM manual_reviews r WHERE r.plugin_id=plugins.id AND r.revision=plugins.revision);
