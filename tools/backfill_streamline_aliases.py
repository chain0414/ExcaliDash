#!/usr/bin/env python3
"""Expand persisted Chinese search aliases without replacing SVGs or user data."""

import argparse
import json
import sqlite3
import time
from pathlib import Path

from import_streamline_assets import load_icons, payload


SOURCE = "streamline-freehand"


def labels(raw):
    value = json.loads(raw)
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise ValueError("Invalid asset label data")
    return value


def backfill(db_path: Path, expected: int, dry_run: bool = False):
    bundle = load_icons()
    uri = f"file:{db_path.resolve()}?mode={'ro' if dry_run else 'rw'}"
    connection = sqlite3.connect(uri, uri=True, timeout=20)
    try:
        if not dry_run:
            connection.execute("BEGIN IMMEDIATE")
        rows = connection.execute(
            "SELECT id, name, aliasesZh, aliasesEn, tags, searchText FROM Asset WHERE source=?",
            (SOURCE,),
        ).fetchall()
        matches = [row for row in rows if row[1] in bundle["icons"]]
        if len(matches) != expected:
            raise ValueError(f"Expected {expected} bundled assets, found {len(matches)}")

        changed = 0
        timestamp = int(time.time() * 1000)
        for asset_id, name, old_zh, raw_en, raw_tags, old_search in matches:
            generated = payload(name, bundle["icons"][name], bundle)["aliasesZh"]
            merged = sorted(set(labels(old_zh)) | set(generated))
            aliases_zh = json.dumps(merged, ensure_ascii=False)
            search_text = " ".join([
                name, SOURCE, *merged, *labels(raw_en), *labels(raw_tags),
            ]).lower()
            if aliases_zh == old_zh and search_text == old_search:
                continue
            changed += 1
            if not dry_run:
                connection.execute(
                    "UPDATE Asset SET aliasesZh=?, searchText=?, version=version+1, updatedAt=? WHERE id=?",
                    (aliases_zh, search_text, timestamp, asset_id),
                )
        if not dry_run:
            connection.commit()
        return len(matches), changed
    except Exception:
        if not dry_run:
            connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--expect", type=int, required=True)
    parser.add_argument("--dry-run", action="store_true")
    options = parser.parse_args()
    try:
        matched, changed = backfill(options.db, options.expect, options.dry_run)
        print(f"matched={matched} {'would_update' if options.dry_run else 'updated'}={changed}")
    except (ValueError, sqlite3.Error, OSError) as error:
        print(f"backfill_failed={type(error).__name__}")
        raise SystemExit(1) from None
