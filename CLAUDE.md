# かんたん予定 — プロジェクトのルール

iPad の Safari で「ホーム画面に追加」して使う、日付つきのやることリスト型の予定管理 PWA。
持ち主はプログラミング初心者。説明は専門用語を短く補いながら行う。

## アプリの考え方
- 「入れるのが面倒」を解消するのが最優先。入力はタイトル＋日付（初期値は今日）だけで完了できること
- 予定はほぼ時刻なし。時刻は任意（「＋時刻」を押した時だけ出す）
- 画面は 2 つ。上の「朝｜予定」ボタンで切り替える
  - **朝**（開いたとき最初に出る）：挨拶と日付・天気（東京）・今日の予定・arXiv quant-ph 新着（3 件）
    - iPad（幅 600px 以上）では**スクロールせず 1 画面に収める**。横向きは 3 列、縦向きは上に天気・下に予定と arXiv を左右に並べる
    - 予定が入りきらないときは入る分だけ出し「ほか ○ 件 →」（app.js の `fitMorningList`）。論文タイトルは 3 行まで
  - **予定**：今日（やり残しを含む）／今週（明日〜日曜、月曜始まり）／これから（来週以降）
- 朝画面の天気が取れなくても（オフライン等）、天気欄に「取得できませんでした」と出すだけで、予定は普通に使えること
- v1 で**やらない**こと：繰り返し予定、編集、通知、月カレンダー、ログイン・同期
  - 追加したくなったら、まず PROGRESS.md の「次にやること」に書いて持ち主と相談する

## 使う技術
- HTML / CSS / JavaScript のみ（素の JS。`<script>` で直接読み込む）
- データ保存：localStorage（キー `kantan-yotei.v1`）
- PWA：`manifest.webmanifest` + `sw.js`（service worker）
- 天気：Open-Meteo（無料・登録不要・API キー不要）。地域は `morning.js` の `WEATHER_PLACE` に緯度・経度で書く
- ニュース：arXiv quant-ph の新着だけ。論文の情報は自由に使えるが、ブラウザから直接は読めないので、GitHub Actions が毎朝 5 時に集めて `arxiv.json` に保存する
  - 一般ニュース（NHK など）は出さない（2026-11-08 持ち主の判断）。理由：日本語ニュースの RSS はどれもブラウザから直接読めず、
    集めて公開すると規約（個人利用のみ・再配信禁止）に触れるおそれがあるため。以前使っていた NHK の旧 RSS は 2026-08 で更新停止していた
- GitHub Actions：`.github/workflows/arxiv.yml` が `scripts/fetch_arxiv.py` を動かす
  - Python の標準機能だけで書く（pip などで追加インストールしない）
  - 新着が無い日（土日など）は `arxiv.json` を書き換えない
- 公開：GitHub Pages（`https://<ユーザー名>.github.io/kantan-yotei/` のサブパスで動く）

## フォルダ構成
```
index.html             画面の骨組み
style.css              見た目
morning.js             朝画面（挨拶・日付・天気・arXiv）。関数を用意するだけで、呼ぶのは app.js。app.js より先に読み込む
arxiv.json             arXiv の新着（GitHub Actions が自動で作る。手で編集しない）
scripts/fetch_arxiv.py arXiv を読んで arxiv.json を作る（GitHub Actions 用）
.github/workflows/arxiv.yml  毎朝 5 時に fetch_arxiv.py を動かす設定
app.js                 動き（保存・表示・追加・完了・削除・バックアップ・画面の切り替え・起動）
manifest.webmanifest   ホーム画面用の設定（名前・アイコン・色）
sw.js                  service worker（オフライン対応）
icons/                 icon-192.png, icon-512.png, apple-touch-icon.png(180px),
                       startup-1640x2360.png / startup-2360x1640.png（iPad の起動画面。背景色 #f4f5f8 の無地）
CLAUDE.md              このファイル
PROGRESS.md            進捗メモ
```
ファイルは増やさない方針。増やすときは理由を PROGRESS.md に書く。

## データ形式（バックアップ JSON も同じ）
```json
{ "app": "kantan-yotei", "version": 1,
  "items": [ { "id": "文字列", "title": "文字列", "date": "YYYY-MM-DD",
               "time": "HH:MM または空文字", "done": false, "createdAt": 1700000000000 } ] }
```
- 日付は**端末のローカル時刻**で `YYYY-MM-DD` 文字列として扱う（`toISOString()` は UTC になるので使わない）
- 形式を変えるときは `version` を上げ、古い形式を読み込めるようにする

## コードの方針
- 初心者が読んで追えること。短い関数＋日本語コメント。凝った書き方をしない
- パスはすべて相対パス（`./sw.js` など）。先頭 `/` の絶対パスは GitHub Pages のサブパスで壊れる
- iPad での操作：ボタン・チェックは高さ 48px 以上、入力欄の文字は 16px 以上（iOS の自動ズーム防止）
- ホーム画面アプリ用に `env(safe-area-inset-*)` で画面の端を避ける
- service worker は「ネット優先・失敗したらキャッシュ」。GitHub Pages の 10 分キャッシュを避けるため `cache: 'no-cache'` で取得する。キャッシュするファイルを増減したら `sw.js` の `APP_FILES` と `CACHE_NAME` を更新する
- 公開する変更をしたら `app.js` の `APP_VERSION` を上げる（画面下に表示され、iPad に更新が届いたか確認できる）
- 作業の区切りごとに git commit し、PROGRESS.md を更新する
- **push の前に必ず `git pull --rebase`**（GitHub Actions が毎朝 arxiv.json を commit するので、GitHub 側が先に進んでいることがある）

## 動作確認のしかた
- PC：`index.html` をダブルクリックでブラウザで開けば、追加・完了・削除・バックアップは確認できる
  （service worker は `file://` では動かないので、オフライン動作は公開後の URL で確認する）
- 変更を公開したら、iPad で実際に操作して確認する。iPad 側は「ネット優先」なので、開き直せば新しい版になる

## やってはいけないこと
- ライブラリ・フレームワーク・ビルドツール（npm など）を入れない。外部 CDN も読み込まない
- ユーザーが入力した文字を `innerHTML` に入れない（`textContent` を使う。悪意ある文字列の実行を防ぐため）
- サーバー・ログインを追加しない。予定のデータは端末の外へ送らない
- 外部への通信は、天気・ニュースを「読みに行く」ことだけ許可（API キー不要のサービスに限る。送ってよいのは地域の緯度・経度などの検索条件だけ）
- ニュースは見出し・リンク（arXiv は著者も）だけを扱い、記事の本文は載せない。取得元を増やすときは、先に利用規約を確認して持ち主に伝える
- 再配信を禁止している取得元（NHK など）の内容を、リポジトリや公開ファイルに保存しない
- 保存形式を、古いデータやバックアップが読めなくなる形で変えない
- 確認なしにデータを消す・上書きする処理を作らない（削除・読み込みは必ず確認を出す）
- 持ち主の確認なしに機能を増やさない
