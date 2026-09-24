#!/usr/bin/env python3
"""Import the bundled brand SVGs into the current ExcaliDash asset catalog.

Each asset keeps its own upstream source and license metadata. Run with
--dry-run to inspect the bundle without writing to ExcaliDash.
"""

import argparse
import gzip
import http.cookiejar
import json
import re
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener


BUNDLE = Path(__file__).with_name("data") / "brand-icons.json.gz"
EXPECTED_NAMES = {
    "brand-amap", "brand-google-maps", "brand-ctrip", "brand-booking",
    "brand-meituan", "brand-dianping", "brand-taobao", "brand-jd",
    "brand-pinduoduo", "brand-xiaohongshu", "brand-douyin", "brand-youtube",
}


def build_assets():
    with gzip.open(BUNDLE, "rt", encoding="utf-8") as stream:
        bundle = json.load(stream)
    records = bundle.get("assets", [])
    if bundle.get("schemaVersion") != 1 or len(records) != 12 or {item["name"] for item in records} != EXPECTED_NAMES:
        raise ValueError("Unexpected brand bundle")
    for record in records:
        svg = record["svg"]
        if not re.match(r"^<svg\b", svg.strip()) or "viewBox=" not in svg or len(svg.encode()) > 128 * 1024:
            raise ValueError("Invalid bundled SVG")
    return records


def import_assets(args, records):
    key_path = Path(args.key_file).expanduser()
    if key_path.stat().st_mode & 0o077:
        raise ValueError("API key file must have mode 0600")
    key = key_path.read_text(encoding="utf-8").strip()
    base_url = args.base_url.rstrip("/")
    opener = build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
    browser_headers = {"User-Agent": "Mozilla/5.0", "Origin": base_url, "Referer": base_url + "/"}
    with opener.open(Request(base_url + "/api/csrf-token", headers=browser_headers), timeout=20) as response:
        csrf = json.load(response)
    request = Request(
        base_url + "/api/assets/import",
        data=json.dumps({"assets": records}, ensure_ascii=False).encode("utf-8"),
        headers={**browser_headers, "Authorization": "Bearer " + key, "Content-Type": "application/json",
                 csrf["header"]: csrf["token"]},
        method="POST",
    )
    try:
        with opener.open(request, timeout=40) as response:
            result = json.load(response)
    except HTTPError as error:
        raise RuntimeError("Asset import HTTP " + str(error.code)) from None
    if sum(result.get(field, 0) for field in ("imported", "updated", "skipped")) != len(records):
        raise RuntimeError("Asset import count mismatch")
    print("imported={imported} updated={updated} skipped={skipped}".format(**result))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="https://draw.timesletter.com")
    parser.add_argument("--key-file", default="~/.config/excalidash/api-key")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    records = build_assets()
    if args.dry_run:
        for record in records:
            print(record["name"], record["source"], len(record["svg"].encode("utf-8")))
        return
    import_assets(args, records)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        detail = str(error) if isinstance(error, (ValueError, RuntimeError)) else ""
        print("import_failed:", type(error).__name__, detail)
        raise SystemExit(1) from None
