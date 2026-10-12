import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { expect, it } from "vitest";

it("uses the collection index after applying the SQLite migration history", () => {
  const db = new Database(":memory:");
  const migrationsRoot = path.resolve(__dirname, "../../prisma/migrations/sqlite");
  try {
    for (const migration of fs.readdirSync(migrationsRoot).sort()) {
      const file = path.join(migrationsRoot, migration, "migration.sql");
      if (fs.existsSync(file)) db.exec(fs.readFileSync(file, "utf8"));
    }
    db.prepare(`INSERT INTO "User" (id, email, passwordHash, name, updatedAt)
      VALUES ('owner', 'owner@example.test', 'synthetic', 'Owner', 0)`).run();
    db.prepare(`INSERT INTO "Collection" (id, name, userId, updatedAt)
      VALUES ('collection', 'Collection', 'owner', 0)`).run();
    db.prepare(`INSERT INTO "Drawing"
      (id, name, elements, appState, userId, collectionId, updatedAt)
      VALUES ('drawing', 'Drawing', '[]', '{}', 'owner', 'collection', 1)`).run();

    const plan = db.prepare(`EXPLAIN QUERY PLAN SELECT id FROM "Drawing"
      WHERE collectionId = ? ORDER BY updatedAt DESC LIMIT 50`)
      .all("collection") as Array<{ detail: string }>;
    expect(plan.map((row) => row.detail).join("\n"))
      .toContain("USING INDEX Drawing_collectionId_updatedAt_idx");
    expect(db.prepare(`SELECT id FROM "Drawing" WHERE collectionId = ?
      ORDER BY updatedAt DESC LIMIT 50`).all("collection"))
      .toEqual([{ id: "drawing" }]);
  } finally {
    db.close();
  }
});
