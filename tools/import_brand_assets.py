#!/usr/bin/env python3
"""Import a curated set of brand SVGs into the current ExcaliDash asset catalog.

Source packages are pinned. Each asset keeps its own source and license record.
Run with --dry-run to inspect the manifest without writing to ExcaliDash.
"""

import argparse
import base64
import hashlib
import http.cookiejar
import io
import json
import re
import tarfile
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener, urlopen


PACKAGES = {
    "simple-icons": ("16.32.0", "https://registry.npmjs.org/simple-icons/-/simple-icons-16.32.0.tgz"),
    "arcticons": ("1.2.58", "https://registry.npmjs.org/@iconify-json/arcticons/-/arcticons-1.2.58.tgz"),
}
DOUYIN_URL = "https://commons.wikimedia.org/wiki/Special:Redirect/file/Douyin_wordmark.svg"
BRANDS = [
    ("amap", "高德地图", "arcticons", "autonavi", ["高德", "高德地图", "高德导航"], ["Amap", "Gaode", "AutoNavi"]),
    ("google-maps", "Google Maps", "simple-icons", "googlemaps", ["谷歌地图", "谷歌"], ["Google Maps"]),
    ("ctrip", "携程", "arcticons", "ctrip-travel", ["携程", "携程旅行"], ["Ctrip", "Trip.com"]),
    ("booking", "Booking.com", "simple-icons", "bookingdotcom", ["缤客", "Booking酒店"], ["Booking", "Booking.com"]),
    ("meituan", "美团", "simple-icons", "meituan", ["美团", "外卖"], ["Meituan"]),
    ("dianping", "大众点评", "simple-icons", "dazhongdianping", ["大众点评", "点评"], ["Dazhong Dianping", "Dianping"]),
    ("taobao", "淘宝", "simple-icons", "taobao", ["淘宝"], ["Taobao"]),
    ("jd", "京东", "arcticons", "jd-com", ["京东", "京东商城"], ["JD.com", "Jingdong"]),
    ("pinduoduo", "拼多多", "arcticons", "pinduoduo", ["拼多多"], ["Pinduoduo"]),
    ("xiaohongshu", "小红书", "simple-icons", "xiaohongshu", ["小红书", "红书"], ["Xiaohongshu", "RedNote"]),
    ("douyin", "抖音", "commons", "douyin-wordmark", ["抖音", "抖音短视频"], ["Douyin"]),
    ("youtube", "YouTube", "simple-icons", "youtube", ["油管", "优兔"], ["YouTube"]),
]


def fetch(url):
    request = Request(url, headers={"User-Agent": "ExcaliDashBrandAssetImport/1.0"})
    with urlopen(request, timeout=40) as response:
        return response.read()


def package_archive(name):
    version, url = PACKAGES[name]
    registry_name = "simple-icons" if name == "simple-icons" else "@iconify-json/arcticons"
    metadata_url = "https://registry.npmjs.org/" + registry_name.replace("/", "%2F") + "/" + version
    metadata = json.loads(fetch(metadata_url))
    integrity = metadata["dist"]["integrity"]
    algorithm, expected = integrity.split("-", 1)
    archive = fetch(url)
    actual = base64.b64encode(hashlib.new(algorithm, archive).digest()).decode()
    if actual != expected:
        raise ValueError("Package integrity mismatch: " + name)
    return tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz")


def build_assets():
    simple = package_archive("simple-icons")
    arcticons = package_archive("arcticons")
    icon_data = json.load(arcticons.extractfile("package/icons.json"))
    records = []
    for slug, title, origin, icon_name, aliases_zh, aliases_en in BRANDS:
        if origin == "simple-icons":
            svg = simple.extractfile("package/icons/" + icon_name + ".svg").read().decode("utf-8")
            source = "simple-icons"
            source_url = "https://github.com/simple-icons/simple-icons/blob/v16.32.0/icons/" + icon_name + ".svg"
            license_url = "https://creativecommons.org/publicdomain/zero/1.0/"
        elif origin == "arcticons":
            icon = icon_data["icons"][icon_name]
            width = icon.get("width", icon_data.get("width", 24))
            height = icon.get("height", icon_data.get("height", 24))
            svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}">{icon["body"]}</svg>'
            source = "arcticons"
            source_url = "https://icon-sets.iconify.design/arcticons/" + icon_name + "/"
            license_url = "https://creativecommons.org/licenses/by-sa/4.0/"
        else:
            svg = fetch(DOUYIN_URL).decode("utf-8")
            source = "wikimedia-commons"
            source_url = "https://commons.wikimedia.org/wiki/File:Douyin_wordmark.svg"
            license_url = "Public domain (text logo); trademarked"
        if not re.match(r"^<svg\b", svg.strip()) or "viewBox=" not in svg or len(svg.encode()) > 128 * 1024:
            raise ValueError("Invalid SVG for " + slug)
        records.append({
            "name": "brand-" + slug, "source": source, "sourceUrl": source_url,
            "license": license_url, "aliasesZh": aliases_zh,
            "aliasesEn": [title, *aliases_en], "tags": ["品牌", "brand"], "svg": svg,
        })
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
