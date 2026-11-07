import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

// Separate database, actual SQLite transactions. No production network or Sync migrations.
export function createAiUsageD1(filename = ':memory:', { migrate = true } = {}) {
  const raw = new DatabaseSync(filename);
  raw.exec('PRAGMA busy_timeout = 10000');
  if (migrate) raw.exec(fs.readFileSync(new URL('../ai-usage-migrations/0001_ai_usage.sql', import.meta.url), 'utf8'));
  const statement = (sql, values = []) => ({ sql, values,
    bind: (...next) => statement(sql, next),
    async first() { return raw.prepare(sql).get(...values) ?? null; },
    async all() { return { success: true, results: raw.prepare(sql).all(...values) }; },
    async run() { return { success: true, meta: { changes: Number(raw.prepare(sql).run(...values).changes) } }; }
  });
  const db = { raw, prepare: statement, withSession: () => db, close: () => raw.close(),
    async batch(statements) {
      // Synchronous transaction body models D1's noninterleaving batch contract.
      raw.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(s => /^\s*SELECT\b/i.test(s.sql)
          ? { success: true, results: raw.prepare(s.sql).all(...s.values) }
          : { success: true, meta: { changes: Number(raw.prepare(s.sql).run(...s.values).changes) } });
        raw.exec('COMMIT'); return results;
      } catch (error) { raw.exec('ROLLBACK'); throw error; }
    }
  };
  return db;
}
