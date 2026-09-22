import importlib.util
import json
import sqlite3
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from backfill_streamline_aliases import backfill


SPEC = importlib.util.spec_from_file_location(
    "import_streamline_assets", Path(__file__).with_name("import_streamline_assets.py")
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class StreamlineBundleTest(unittest.TestCase):
    def test_all_icons_have_svg_and_chinese_search_alias(self):
        bundle = MODULE.load_icons()
        for name, icon in bundle["icons"].items():
            with self.subTest(name=name):
                record = MODULE.payload(name, icon, bundle)
                self.assertTrue(record["aliasesZh"])
                self.assertTrue(record["aliasesEn"])
                self.assertEqual(record["license"], MODULE.LICENSE)
                self.assertTrue(record["sourceUrl"].endswith("/" + name + "/"))
                self.assertLess(len(record["svg"].encode()), 128 * 1024)
                root = ET.fromstring(record["svg"])
                self.assertEqual(root.tag, "{http://www.w3.org/2000/svg}svg")

    def test_related_chinese_terms_are_indexed_without_matching_every_icon(self):
        bundle = MODULE.load_icons()
        camera = MODULE.payload("camera", bundle["icons"]["camera"], bundle)
        self.assertIn("摄像机", camera["aliasesZh"])
        self.assertIn("摄影机", camera["aliasesZh"])
        self.assertIn("摄像头", camera["aliasesZh"])
        self.assertNotIn("摄像机", MODULE.payload("database", bundle["icons"]["database"], bundle)["aliasesZh"])
        self.assertIn("握手", MODULE.payload("business-deal-handshake", bundle["icons"]["business-deal-handshake"], bundle)["aliasesZh"])

    def test_backfill_preserves_existing_aliases_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "catalog.db"
            with sqlite3.connect(path) as db:
                db.execute("CREATE TABLE Asset (id TEXT, name TEXT, source TEXT, aliasesZh TEXT, aliasesEn TEXT, tags TEXT, searchText TEXT, version INTEGER, updatedAt INTEGER)")
                db.execute("INSERT INTO Asset VALUES (?,?,?,?,?,?,?,?,?)", (
                    "a1", "camera", "streamline-freehand", '["相机", "自定义"]', '["camera"]', '["手绘"]',
                    "camera streamline-freehand 相机 自定义 camera 手绘", 2, 1,
                ))
                db.execute("INSERT INTO Asset VALUES (?,?,?,?,?,?,?,?,?)", (
                    "a2", "camera", "another-source", '["相机"]', '["camera"]', '["手绘"]',
                    "camera another-source 相机 camera 手绘", 1, 1,
                ))
            self.assertEqual(backfill(path, 1, dry_run=True), (1, 1))
            self.assertEqual(backfill(path, 1), (1, 1))
            self.assertEqual(backfill(path, 1), (1, 0))
            with sqlite3.connect(path) as db:
                aliases, search, version, timestamp = db.execute(
                    "SELECT aliasesZh,searchText,version,updatedAt FROM Asset WHERE id='a1'"
                ).fetchone()
                other = db.execute("SELECT aliasesZh,version FROM Asset WHERE id='a2'").fetchone()
            self.assertTrue({"自定义", "摄像机", "摄影机"}.issubset(json.loads(aliases)))
            self.assertIn("摄像机", search)
            self.assertEqual(version, 3)
            self.assertGreater(timestamp, 1)
            self.assertEqual(other, ('["相机"]', 1))


if __name__ == "__main__":
    unittest.main()
