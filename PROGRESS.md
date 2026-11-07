# 進捗メモ

## 現在の状況
画面と基本機能（追加・表示・完了・削除・保存）が完成。次はバックアップ機能。

## 完了したこと
- 2026-11-07 git をインストール（winget）し、`kantan-yotei` フォルダで git 管理を開始
- 2026-11-07 CLAUDE.md / PROGRESS.md を作成
- 2026-11-07 画面と基本機能（index.html / style.css / app.js）
  - 追加（今日／明日／日付を選ぶ、時刻は任意）、今日・今週・これからの一覧、やり残し表示、完了チェック、削除（確認あり）
  - localStorage 保存。壊れたデータは `kantan-yotei.v1.broken` に避難して消さない
  - Edge（画面なしモード）で自動テスト 19 項目すべて合格、iPad サイズで見た目を確認

## 次にやること
- [x] 画面と基本機能（追加・表示・完了チェック・削除・保存）
- [ ] バックアップ（書き出し・読み込み）
- [ ] PWA 化（manifest・service worker・アイコン）
- [ ] GitHub アカウント作成 → GitHub Pages で公開 → iPad のホーム画面に追加

## 困っていること・メモ
- GitHub アカウントはまだ無い。公開の段階で作成する
- git のコミット用メールアドレスは仮（`kantan-yotei@example.invalid`）。GitHub アカウント作成後に GitHub が用意する非公開用アドレス（noreply）に変えると、本物のメールが公開されない
