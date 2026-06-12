#!/usr/bin/env python3
"""
HP変更検知スクリプト
subsidies.json の各 sourceUrl を巡回し、ページ本文ハッシュを比較して変更を検出する。
"""

import hashlib
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path
from html.parser import HTMLParser

SCRIPT_DIR = Path(__file__).parent
HASHES_FILE = SCRIPT_DIR / "hashes.json"
DATA_DIR = SCRIPT_DIR.parent / "data"
SUBSIDIES_FILE = DATA_DIR / "subsidies.json"


class BodyTextParser(HTMLParser):
    """メインコンテンツ（body）のテキストを抽出する簡易パーサ。"""
    SKIP_TAGS = {'script', 'style', 'noscript', 'meta', 'link', 'head'}

    def __init__(self):
        super().__init__()
        self._in_skip = 0
        self.texts = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() in self.SKIP_TAGS:
            self._in_skip += 1

    def handle_endtag(self, tag):
        if tag.lower() in self.SKIP_TAGS and self._in_skip > 0:
            self._in_skip -= 1

    def handle_data(self, data):
        if self._in_skip == 0:
            stripped = data.strip()
            if stripped:
                self.texts.append(stripped)


def fetch_page_hash(url: str, timeout: int = 15) -> str | None:
    """URLのページ本文をハッシュ化して返す。取得失敗時はNone。"""
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; ShimonosekiSubsidyBot/1.0)"}
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            encoding = resp.headers.get_content_charset() or "utf-8"
            html = raw.decode(encoding, errors="replace")
        parser = BodyTextParser()
        parser.feed(html)
        body_text = " ".join(parser.texts)
        return hashlib.sha256(body_text.encode("utf-8")).hexdigest()
    except urllib.error.URLError as e:
        print(f"  [WARN] 取得失敗 {url}: {e}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"  [WARN] エラー {url}: {e}", file=sys.stderr)
        return None


def load_hashes() -> dict:
    if HASHES_FILE.exists():
        with open(HASHES_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_hashes(hashes: dict):
    with open(HASHES_FILE, "w", encoding="utf-8") as f:
        json.dump(hashes, f, ensure_ascii=False, indent=2)


def main():
    with open(SUBSIDIES_FILE, encoding="utf-8") as f:
        data = json.load(f)

    # 重複URLを排除
    urls = {}
    for sub in data.get("subsidies", []):
        url = sub.get("sourceUrl", "").strip()
        if url and url.startswith("http"):
            urls[url] = sub.get("name", {}).get("ja", "")

    print(f"チェック対象: {len(urls)} URL")
    old_hashes = load_hashes()
    new_hashes = dict(old_hashes)
    changed = []

    for url, name in urls.items():
        print(f"  確認中: {name} ({url})")
        current_hash = fetch_page_hash(url)
        if current_hash is None:
            print(f"    → スキップ（取得不可）")
            continue

        prev_hash = old_hashes.get(url)
        if prev_hash is None:
            print(f"    → 初回登録")
            new_hashes[url] = current_hash
        elif prev_hash != current_hash:
            print(f"    → 変更を検出！")
            changed.append({"url": url, "name": name})
            new_hashes[url] = current_hash
        else:
            print(f"    → 変更なし")

    save_hashes(new_hashes)

    if changed:
        print(f"\n⚠️  変更が検出されたURL ({len(changed)}件):")
        for item in changed:
            print(f"  - {item['name']}: {item['url']}")
        # GitHub ActionsのIssue作成用に出力
        with open(SCRIPT_DIR / "changed_urls.json", "w", encoding="utf-8") as f:
            json.dump(changed, f, ensure_ascii=False, indent=2)
        sys.exit(1)  # 変更あり → exit code 1でActionsに通知
    else:
        print("\n✅ 変更なし")
        sys.exit(0)


if __name__ == "__main__":
    main()
