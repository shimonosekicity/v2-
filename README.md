# 下関市 移住・定住支援補助金 要件確認アプリ

下関市役所の移住・定住相談窓口向けの補助金要件確認ツールです。  
来庁者と職員が一緒にスマートフォンで要件をチェックし、その場で「該当する可能性があるか」を判定します。

> ⚠️ **免責事項**  
> 本アプリの情報は令和8年度（2026年度）時点の調査に基づく参考情報です。  
> 最終的な対象可否は各担当課の判断によります。最新の要綱を必ずご確認ください。

---

## アプリURL

GitHub Pages公開後、以下のURLで利用できます：

```
https://<GitHubユーザー名>.github.io/shimonoseki-subsidy-checker/
```

---

## データ更新手順（職員向け）

補助金の要件・金額・担当課等が変わった場合の更新手順です。

### 方法A：Googleスプレッドシートから更新（推奨）

1. **スプレッドシートを開く**  
   「補助金マスタ」「要件」の2シートにデータが入っています。

2. **データを編集する**  
   - 「補助金マスタ」シート：補助金名・金額・担当課・URLなど1行1件で管理
   - 「要件」シート：各補助金の要件を1行1要件で管理

3. **JSONを書き出す**  
   スプレッドシートのメニューバー「補助金ツール」→「JSONを書き出す」をクリック  
   ※ GitHubトークンを設定済みの場合は自動でコミットされます

4. **GitHubにアップロード（自動Pushでない場合）**  
   Googleドライブに保存された `subsidies.json` をダウンロードし、  
   GitHubの `data/subsidies.json` を置き換えます

5. **GitHub Pagesに反映される**（数分待つ）

### 方法B：JSONを直接編集する（上級者向け）

`data/subsidies.json` を直接編集してGitHubにコミットします。  
スキーマの詳細は `admin/template_master.csv` / `admin/template_requirements.csv` を参照。

---

## HP変更通知への対応手順

毎月1日に自動でHP変更を検知し、変更があった場合はGitHub Issueが作成されます。

1. **Issueを確認する**  
   `[要確認] HP変更の可能性` というタイトルのIssueを開く

2. **リンク先のHPを確認する**  
   Issueに記載されたURLを開き、補助金の要件・金額等に変更がないか確認する

3. **必要に応じてデータを更新する**  
   変更があれば上記「データ更新手順」に従ってスプレッドシートを更新

4. **Issueをクローズする**

> ⚠️ このIssueはHP変更の「可能性」の通知です。  
> レイアウト変更などでも通知が来ることがあります。必ず要綱の本文を人が確認してください。

---

## ファイル構成

```
shimonoseki-subsidy-checker/
├── index.html                 # アプリ本体（SPA）
├── css/style.css              # スタイル（スマホファースト）
├── js/app.js                  # アプリのロジック
├── data/
│   ├── subsidies.json         # ★ 補助金データ（更新対象の核心ファイル）
│   └── i18n.json              # UIラベルの多言語辞書
├── admin/
│   ├── sheet-to-json.gs       # Googleスプレッドシート用 変換スクリプト（GAS）
│   ├── template_master.csv    # 補助金マスタのCSVテンプレート
│   └── template_requirements.csv # 要件のCSVテンプレート
├── scripts/
│   ├── check_hp.py            # HP変更検知スクリプト
│   └── hashes.json            # ハッシュキャッシュ（自動生成・直接編集不要）
└── .github/workflows/
    └── check-hp-update.yml    # 月次HP変更検知 GitHub Actions
```

---

## GitHub Pages の設定方法

1. GitHubリポジトリの **Settings** → **Pages** を開く
2. Source を `Deploy from a branch` に設定
3. Branch を `main`、フォルダを `/ (root)` に設定
4. Save をクリック → 数分でURLが発行される

---

## GAS スクリプトの設定方法

1. Googleスプレッドシートを開き、**拡張機能** → **Apps Script** を選択
2. `admin/sheet-to-json.gs` の内容をコピーして貼り付ける
3. **保存** → **デプロイ不要**（スプレッドシートのメニューから直接実行）

### GitHub 自動Pushを有効にする場合

1. GASの **プロジェクトの設定** → **スクリプトプロパティ** を開く
2. 以下のプロパティを追加する：

| プロパティ名 | 値 |
|---|---|
| `GITHUB_TOKEN` | Personal Access Token（`repo`スコープ必要） |
| `GITHUB_OWNER` | GitHubユーザー名またはOrg名 |
| `GITHUB_REPO` | リポジトリ名（例: `shimonoseki-subsidy-checker`）|
| `GITHUB_BRANCH` | ブランチ名（例: `main`）|

---

## 困ったとき・システム担当への連絡

システムの設定変更・不具合については担当者にご連絡ください。

- データの追加・変更は職員自身でスプレッドシートから行えます
- アプリのURL変更・GitHub設定はシステム担当者が対応します

---

## 多言語対応

対応言語：日本語 / English / 中文（简体）/ 한국어 / Tiếng Việt

- UIラベル（ボタン・結果メッセージ等）は5言語対応
- 補助金名・概要は5言語対応
- **要件本文は日本語のみ**（正確性を優先）  
  他言語で確認する場合は「担当課にご確認ください」と表示されます
