#!/usr/bin/env python3
"""Idempotently import the CC BY 4.0 Streamline Freehand set into ExcaliDash.

The bundle is retained for reproducibility. SVG bytes live in the server's asset
catalog after import; clients never need this file to search or use assets.
"""

import argparse
import gzip
import http.cookiejar
import json
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener


BUNDLE = Path(__file__).with_name("data") / "streamline-freehand.icons.json.gz"
LICENSE = "https://creativecommons.org/licenses/by/4.0/"
GLOSSARY = {
    "accessories":"配件", "accounting":"会计 财务", "add":"添加", "advertising":"广告", "airplane":"飞机 旅行", "alert":"警报", "alerts":"警报", "allowances":"允许 禁止", "amusement":"游乐", "analytics":"分析 数据", "android":"安卓", "answer":"回答", "app":"应用", "apps":"应用", "archive":"归档", "barcode":"条码", "board":"画板", "book":"书籍 知识", "bookmarks":"书签", "browser":"浏览器", "bug":"漏洞", "business":"商业 工作", "cables":"线缆", "calendar":"日历", "camera":"相机", "card":"卡片", "cash":"现金", "cell":"手机", "cellular":"手机", "charging":"充电", "check":"确认", "cleaning":"清洁", "cloud":"云", "code":"代码 编程", "coding":"代码 编程", "collaboration":"协作", "color":"颜色", "computer":"电脑", "connect":"连接", "content":"内容", "controls":"控制", "conversation":"对话", "copy":"复制", "creativity":"创意", "credit":"信用", "crypto":"加密", "currency":"货币", "cursor":"光标", "customer":"客户", "dashboard":"仪表盘", "data":"数据", "database":"数据库", "delete":"删除", "design":"设计", "desktop":"桌面 电脑", "digital":"数字", "disability":"无障碍", "discount":"折扣", "document":"文档", "donation":"捐赠", "download":"下载", "drawer":"抽屉", "edit":"编辑", "email":"邮件", "emoji":"表情", "envelope":"信封", "equalizer":"均衡器", "face":"脸", "family":"家庭", "file":"文件", "filter":"筛选", "focus":"聚焦", "form":"表单", "gesture":"手势", "graphic":"图形", "graph":"图表", "grid":"网格", "hand":"手", "headphones":"耳机", "help":"帮助", "hierarchy":"层级", "home":"家庭 首页", "human":"人", "image":"图片", "information":"信息", "job":"工作", "keyboard":"键盘", "laptop":"笔记本电脑", "layers":"图层", "learning":"学习", "light":"灯 光", "link":"链接", "lists":"列表", "loading":"加载", "lock":"锁定", "login":"登录", "mailbox":"邮箱", "memory":"内存 记忆", "menu":"菜单", "messages":"消息", "microphone":"麦克风", "mobile":"移动 手机", "mobilephone":"手机", "modern":"现代", "module":"模块", "money":"金钱", "monitor":"显示器 监控", "move":"移动", "moving":"移动", "movies":"电影", "multimedia":"多媒体", "music":"音乐", "navigation":"导航", "network":"网络", "newspaper":"报纸", "notes":"笔记", "office":"办公", "optimization":"优化", "organization":"组织", "paragraphs":"段落", "password":"密码", "payment":"支付", "performance":"性能", "phone":"电话 手机", "photo":"照片", "picture":"图片", "playlist":"播放列表", "plugin":"插件", "power":"电源", "presentation":"演示", "print":"打印", "product":"产品", "products":"产品", "programming":"编程 代码", "project":"项目", "qr":"二维码", "radio":"广播", "read":"阅读", "receipt":"收据", "remove":"删除", "resize":"缩放", "responsive":"响应式", "retouch":"修图", "rotate":"旋转", "safety":"安全", "saving":"储蓄", "scanner":"扫描", "screen":"屏幕", "scroll":"滚动", "search":"搜索 检索", "security":"安全", "select":"选择", "send":"发送", "server":"服务器", "settings":"设置", "share":"分享", "shape":"形状", "shop":"商店", "shopping":"购物", "show":"展示", "signal":"信号", "smart":"智能", "smartphone":"智能手机", "smiley":"笑脸 表情", "speaker":"扬声器", "stairs":"楼梯", "stats":"统计", "strategy":"策略", "synchronize":"同步", "tag":"标签", "tags":"标签", "task":"任务", "text":"文字", "time":"时间", "timer":"计时", "touch":"触摸", "transfer":"传输 转账", "upload":"上传", "user":"用户", "vectors":"矢量", "video":"视频", "view":"查看", "voice":"语音", "volume":"音量", "water":"水", "webcam":"摄像头", "website":"网站", "wifi":"无线网络", "window":"窗口", "wireless":"无线", "work":"工作", "workflow":"工作流 流程", "worldwide":"全球 网络", "zoom":"缩放",
    "abacus":"算盘", "alarm":"闹钟", "arrow":"箭头", "bag":"包", "basket":"篮子", "bell":"铃铛", "book":"书籍 知识", "branch":"分支", "calendar":"日历", "cart":"购物车", "chart":"图表", "clock":"时钟", "code":"代码", "document":"文档", "flight":"航班 旅行", "folder":"文件夹", "graph":"图表", "invoice":"发票", "luggage":"行李 旅行", "map":"地图", "pen":"笔", "plane":"飞机 旅行", "robot":"机器人", "source":"来源", "team":"团队", "travel":"旅行", "warning":"警告", "wheel":"轮子", "world":"世界",
}
GLOSSARY.update({
    "arduino":"单片机", "begging":"乞求", "giving":"给予", "bluetooth":"蓝牙", "logo":"标志", "casino":"赌场", "slot":"老虎机", "machine":"机器", "cd":"光盘", "disc":"光盘", "player":"播放器", "rom":"光盘", "burn":"刻录", "broken":"损坏", "circus":"马戏团", "clown":"小丑", "tent":"帐篷", "composition":"构图", "paronama":"全景", "horizontal":"横向", "concert":"音乐会", "couple":"情侣", "duet":"合唱", "coupon":"优惠券", "cut":"剪切", "percent":"百分比", "crm":"客户关系管理", "lead":"潜在客户", "distribution":"分配", "crop":"裁剪", "expand":"展开", "e":"电子商务", "commerce":"电商", "click":"点击", "buy":"购买", "earpods":"耳机", "attention":"注意", "charge":"充电", "escalator":"扶梯", "ascend":"上升", "descend":"下降", "person":"人", "famous":"知名", "character":"角色", "pokemon":"宝可梦", "starwars":"星球大战", "fireworks":"烟花", "flip":"翻转", "reflect":"反射", "right":"向右", "up":"向上", "floppy":"软盘", "disk":"磁盘", "garbage":"垃圾", "throw":"丢弃", "gps":"定位", "location":"位置", "rectangle":"矩形", "hard":"硬盘", "drive":"驱动器", "exertnal":"外置", "instrument":"乐器", "accordian":"手风琴", "saxophone":"萨克斯", "ipod":"音乐播放器", "iris":"虹膜", "scan":"扫描", "target":"目标", "laundry":"洗衣", "washing":"洗涤", "layouts":"布局", "array":"阵列", "top":"顶部", "three":"三个", "columns":"列", "lens":"镜头", "shutter":"快门", "lift":"电梯", "two":"两个", "people":"人", "elevator":"电梯", "locker":"储物柜", "room":"房间", "hanger":"衣架", "woman":"女性", "suitcase":"行李箱", "umbrella":"雨伞", "wash":"清洗", "hands":"双手", "mask":"面具", "diamond":"钻石", "media":"媒体", "protection":"保护", "shield":"盾牌", "meeting":"会议", "co":"协作", "working":"工作", "monetization":"变现", "bill":"账单", "magnet":"磁铁", "mouse":"鼠标", "night":"夜晚", "club":"俱乐部", "disco":"迪斯科", "ball":"球", "party":"派对", "alchoholic":"酒精", "drink":"饮料", "balloon":"气球", "decoration":"装饰", "banner":"横幅", "pathfinder":"路径", "merge":"合并", "push":"推送", "notification":"通知", "reorder":"排序", "role":"角色", "playing":"扮演", "games":"游戏", "weapon":"武器", "equipment":"装备", "crate":"箱子", "chest":"箱子", "ruler":"尺子", "seat":"座位", "vip":"贵宾", "stamps":"邮票", "portrait":"肖像", "swimming":"游泳", "pool":"泳池", "tablet":"平板电脑", "application":"应用", "taking":"拍摄", "pictures":"照片", "circle":"圆形", "tape":"磁带", "cassette":"磁带", "terminal":"终端", "toilet":"洗手间", "no":"禁止", "trash":"垃圾", "paper":"纸", "sign":"标志", "transform":"变换", "ui":"界面", "step":"步骤", "indicator":"指示器", "webpage":"网页", "bullets":"项目符号", "unlink":"取消链接", "chain":"链条", "unlock":"解锁", "vintage":"复古", "tv":"电视", "vinyl":"黑胶唱片", "record":"唱片", "gramophone":"留声机", "walking":"步行", "symbol":"符号", "walkman":"随身听", "wealth":"财富", "crystal":"水晶", "shine":"闪耀", "gold":"黄金", "bars":"金条", "pearl":"珍珠", "ring":"戒指", "treasure":"宝藏", "open":"打开",
})


def load_icons():
    with gzip.open(BUNDLE, "rt", encoding="utf-8") as stream:
        bundle = json.load(stream)
    if bundle.get("prefix") != "streamline-freehand" or len(bundle.get("icons", {})) != 1000:
        raise ValueError("Unexpected Streamline bundle")
    return bundle


def payload(name, icon, bundle):
    width = icon.get("width", bundle.get("width", 24))
    height = icon.get("height", bundle.get("height", 24))
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">{icon["body"]}</svg>'
    tokens = [token for token in name.split("-") if not token.isdigit()]
    zh = sorted({word for token in tokens for word in GLOSSARY.get(token, "").split()})
    return {
        "name": name, "source": "streamline-freehand", "sourceUrl": f"https://icon-sets.iconify.design/streamline-freehand/{name}/",
        "license": LICENSE, "aliasesEn": tokens, "aliasesZh": zh, "tags": ["Streamline", "Freehand", "手绘"], "svg": svg,
    }


def run(args):
    bundle = load_icons()
    names = sorted(bundle["icons"])
    records = [payload(name, bundle["icons"][name], bundle) for name in names]
    if args.dry_run:
        print("icons:", len(records), "with_chinese_aliases:", sum(bool(r["aliasesZh"]) for r in records))
        return
    if args.base_url.startswith("https://") and not args.key_file:
        raise ValueError("HTTPS import requires --key-file")
    key = Path(args.key_file).expanduser().read_text().strip() if args.key_file else None
    if key and Path(args.key_file).stat().st_mode & 0o077:
        raise ValueError("Key file must be private (0600)")
    jar = http.cookiejar.CookieJar()
    opener = build_opener(HTTPCookieProcessor(jar))
    csrf_header = csrf_token = None
    if not key:
        with opener.open(args.base_url + "/api/csrf-token", timeout=20) as response:
            csrf = json.load(response)
        csrf_header, csrf_token = csrf.get("header", "x-csrf-token"), csrf["token"]
    imported = updated = skipped = 0
    selected = records[:args.limit or None]
    for start in range(0, len(selected), args.batch_size):
        batch = selected[start:start + args.batch_size]
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if key:
            headers["Authorization"] = "Bearer " + key
        else:
            headers[csrf_header] = csrf_token
        req = Request(args.base_url + "/api/assets/import", json.dumps({"assets": batch}, ensure_ascii=False).encode(), headers, method="POST")
        try:
            with opener.open(req, timeout=30) as response:
                if response.status != 200:
                    raise RuntimeError("Asset import did not succeed")
                counts = json.load(response)
                if sum(counts.get(key, 0) for key in ("imported", "updated", "skipped")) != len(batch):
                    raise RuntimeError("Asset import count mismatch")
                imported += counts["imported"]
                updated += counts["updated"]
                skipped += counts["skipped"]
        except HTTPError as error:
            # Keep response and credentials out of stdout/stderr.
            raise RuntimeError(f"Asset import stopped at record {start + 1}: HTTP {error.code}") from None
        print("processed:", start + len(batch), "of", len(selected), flush=True)
        if args.delay:
            time.sleep(args.delay)
    print("import_result:", "imported", imported, "updated", updated, "skipped", skipped)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:17667")
    parser.add_argument("--key-file")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--batch-size", type=int, choices=range(1, 101), metavar="1..100", default=50)
    parser.add_argument("--delay", type=float, default=0)
    parser.add_argument("--dry-run", action="store_true")
    options = parser.parse_args()
    try:
        run(options)
    except Exception as error:
        print("import_failed:", type(error).__name__, str(error) if isinstance(error, (ValueError, RuntimeError)) else "", flush=True)
        raise SystemExit(1)
