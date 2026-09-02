// 起動引数から「開くべきファイル」を取り出す。
// ダブルクリックや「プログラムから開く」で渡ってくるのは絶対パスだが、
// 更新後の再起動（--updated / --force-run）や Chromium のスイッチも同じ argv に並ぶ。
// electron に依存させないのは、この判定だけを単体テストできるようにするため。
function filePathsFromArgv(argv, options = {}) {
    const { isFile = () => false } = options;
    if (!Array.isArray(argv)) return [];
    const found = [];
    // argv[0] は実行ファイル自身なので必ず飛ばす
    for (const arg of argv.slice(1)) {
        if (typeof arg !== 'string' || arg === '') continue;
        if (arg.startsWith('-')) continue;
        if (!isFile(arg)) continue;
        if (!found.includes(arg)) found.push(arg);
    }
    return found;
}

module.exports = { filePathsFromArgv };
