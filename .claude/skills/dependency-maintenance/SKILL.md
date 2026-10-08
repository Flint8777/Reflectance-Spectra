---
name: dependency-maintenance
description: このリポジトリの Dependabot PR・OSV-Scanner の CI 失敗・推移依存の脆弱性対応・pnpm の install スクリプト許可制（allowBuilds）を扱うときの手順。依存関係の更新、脆弱性アラート、`pnpm-workspace.yaml` の overrides / allowBuilds に触れるときに使う。
---

# 依存関係メンテナンス

パッケージマネージャは pnpm 11（`package.json` の `packageManager`）。npm / `package-lock.json` は使わない。lockfile は `pnpm-lock.yaml`、pnpm の設定（`overrides` / `allowBuilds`）は `pnpm-workspace.yaml` に置く。

## Dependabot / OSV 運用

- OSV-Scanner は `osv-scanner-scheduled.yml`（毎日 + main への push、`osv-scanner scan source -r .`）だけで、dev/推移依存の脆弱性でも `exit 1` で落ちる。**PR 向けの OSV スキャンは無い**ので、PR の段階では気づけない。依存を触る PR の前に手元で `pnpm audit`（実行時依存だけなら `pnpm audit --prod`）を見る。修正をマージしたら main への push で走る scan の結果まで確認する
- 推移依存は親の range 内に修正版があれば `pnpm update <pkg> --depth 99` で lockfile だけ更新する。range 内に修正版があっても lockfile が動かないことがあり、そのときは下の overrides で下限を上げる
- Dependabot の ecosystem 設定は `npm` のままで `pnpm-lock.yaml` に対応している
- このリポジトリは GitHub auto-merge 無効。Dependabot PR は CI green 確認後 `gh pr merge <n> --squash --delete-branch` で手動マージ。lockfile を触る PR は1件マージ毎に残りが CONFLICTING になる。Dependabot が自分でリベースすることも多いが、動かなければ `@dependabot rebase` を**人が**コメントする（クラウドの Claude セッションが書くコメントは文字が書き換えられて Dependabot に届かない）
- Dependabot alerts + security updates は有効。CVE 公開時に修正PRが自動生成され、main 側を先に直すと重複 PR は自動クローズされる
- 未解決: #68 sprintf-js（moderate、electron-builder 配下で dev のみ、修正版未公開）。Open のまま様子見。`pnpm audit` の 1 moderate はこれ
- pnpm は Windows でも lockfile を LF で書く（npm 時代の CRLF 全行書き換えは起きない）。`.gitattributes` は未設定

## 推移依存の overrides

- 親が修正版に届かない範囲を pin している場合（例: plotly.js → maplibre-gl、concurrently → shell-quote）や、`pnpm update` で動かない場合は `pnpm-workspace.yaml` の `overrides` で下限を上げる
- 他系列を巻き込まないようキーを絞る:
  - 版範囲付き: `'undici@>=6 <6.28.1': '^6.28.1'`（7.x / 8.x は触らない）
  - 親限定: `'concurrently>shell-quote': '^1.12.0'`
  - 親の版限定: `'plist@3.1.0>@xmldom/xmldom': '^0.8.15'`（0.8 系と 0.9 系で API が違うため親ごとに分ける）
- 各 override には理由（どの親経由か、なぜ update で済まないか、API が変わらないか）と GHSA をコメントで残す
- 変更後は `pnpm install` で lockfile を更新し、`pnpm-workspace.yaml` と `pnpm-lock.yaml` を同じコミットに入れる。CI は `pnpm install --frozen-lockfile` なので片方だけだと落ちる

## install スクリプト（pnpm `allowBuilds`）

- pnpm は依存の `preinstall`/`install`/`postinstall` を許可制で実行する。許可リストは `pnpm-workspace.yaml` の `allowBuilds`（`true` で実行、`false` で実行しないと明示）。npm v12 の `allowScripts` は pnpm では不要で、`package.json` にも無い
- 現状の設定と中身:
  - `electron: true` — electron 44.5.1 は postinstall を持たず、初回起動時（`require('electron')`）に `install.js` でバイナリを落とす。現状この `true` は効いていない
  - `electron-winstaller: true` — `install` で 7z のアーキを選ぶだけ（Squirrel 用。配布は NSIS なので使っていない）
  - `esbuild: true` — vite 8 は Rolldown で esbuild は optional peer。`pnpm-lock.yaml` に解決されておらず、現状効いていない
  - `es5-ext: false` — postinstall は感謝メッセージのみ
- install スクリプトを持つのに `allowBuilds` に無いパッケージがあると、スクリプトは実行されず、`pnpm install` 自体が `ERR_PNPM_IGNORED_BUILDS` で exit 1 になる（pnpm 11.22.0 で実測）。CI も同じく install で落ちるので、Dependabot PR が新しい install スクリプト持ちを連れてきたらここで気づく。中身を調べ、必要なら `true`、不要なら `false` を明記する（`false` なら install は通る）
- 依存監査: lockfile（v9）は install スクリプトの有無を記録しないので、`node_modules/.pnpm` を grep する。`"install"` という名前の依存（regl / @plotly/regl）も引っかかり、同じパッケージが依存元ごとに重複して出るので中身を目で確かめる（現状の実物は electron-winstaller と es5-ext だけ）

  ```bash
  grep -lE '"(preinstall|install|postinstall)"\s*:' node_modules/.pnpm/*/node_modules/{*,@*/*}/package.json
  ```

- git/remote 依存の有無は `pnpm-lock.yaml` を `tarball:` / `git` で grep（現状ゼロ）
