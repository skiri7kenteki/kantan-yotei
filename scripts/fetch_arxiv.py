"""arXiv quant-ph の新着を読んで arxiv.json を作る（GitHub Actions が毎朝 5 時に動かす）

- Python の標準機能だけで書く（追加のインストールは不要）
- 新着が無い日（土日など）は arxiv.json を書き換えない → アプリには前回の分が日付つきで出る
- 試すとき：python scripts/fetch_arxiv.py <保存した RSS ファイル>
"""

import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

FEED_URL = "https://rss.arxiv.org/rss/quant-ph"
LIST_URL = "https://arxiv.org/list/quant-ph/new"   # 新着の一覧ページ（アプリの「すべて見る」）
MAX_ITEMS = 10                                    # 保存する件数（何件出すかはアプリ側で決める）
OUTPUT = Path(__file__).resolve().parent.parent / "arxiv.json"
NS = {"arxiv": "http://arxiv.org/schemas/atom", "dc": "http://purl.org/dc/elements/1.1/"}


def read_feed(source):
    """RSS を読む。引数にファイルが渡されたらそれを使う（試験用）"""
    if source:
        return Path(source).read_bytes()
    request = urllib.request.Request(FEED_URL, headers={"User-Agent": "kantan-yotei (GitHub Actions)"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def clean(text):
    """改行や連続した空白を 1 つの空白にまとめる"""
    return re.sub(r"\s+", " ", text or "").strip()


def short_authors(text):
    """「A, B, C, D」→「A, B ほか」"""
    names = [n.strip() for n in clean(text).split(",") if n.strip()]
    return ", ".join(names[:2]) + (" ほか" if len(names) > 2 else "")


def main():
    root = ET.fromstring(read_feed(sys.argv[1] if len(sys.argv) > 1 else None))
    channel = root.find("channel")

    new_items = []
    for item in channel.findall("item"):
        # announce_type：new（新着）/ cross（他分野から）/ replace（改訂）。新着だけを数える
        if (item.findtext("arxiv:announce_type", default="new", namespaces=NS) or "").strip() != "new":
            continue
        url = clean(item.findtext("link"))
        if not url.startswith("https://arxiv.org/"):
            url = url.replace("http://arxiv.org/", "https://arxiv.org/")
        new_items.append({
            "title": clean(item.findtext("title")),
            "url": url,
            "authors": short_authors(item.findtext("dc:creator", default="", namespaces=NS)),
        })

    if not new_items:
        print("新着なし（土日など）。arxiv.json は書き換えません")
        return

    # 新着が発表された日（arXiv の時刻＝米国東部時間の日付）
    announced = parsedate_to_datetime(channel.findtext("pubDate")).date().isoformat()
    data = {
        "source": "arXiv quant-ph",
        "date": announced,
        "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "newCount": len(new_items),
        "listUrl": LIST_URL,
        "items": new_items[:MAX_ITEMS],
    }
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{announced} の新着 {len(new_items)} 件 → arxiv.json に保存")


if __name__ == "__main__":
    main()
