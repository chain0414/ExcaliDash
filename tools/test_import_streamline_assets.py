import importlib.util
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path


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


if __name__ == "__main__":
    unittest.main()
