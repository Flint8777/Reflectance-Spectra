// shell.openExternal に渡してよい URL かを判定する。
// 文字列の先頭一致だと `.../Reflectance-Spectra-evil` のような別リポジトリも通るので、
// URL として分解してからホストとパスをセグメント単位で比べる。
// electron に依存させないのは、この判定だけを単体テストできるようにするため。
const ALLOWED_HOST = 'github.com';
const ALLOWED_REPO_PATH = '/Flint8777/Reflectance-Spectra';

function isAllowedExternalUrl(url) {
    if (typeof url !== 'string') return false;
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }
    if (parsed.protocol !== 'https:') return false;
    // host はポート込みなので、ポート指定付きもここで弾かれる
    if (parsed.host !== ALLOWED_HOST) return false;
    if (parsed.username !== '' || parsed.password !== '') return false;
    // pathname は URL パーサで `..` が解決済み
    const { pathname } = parsed;
    return (
        pathname === ALLOWED_REPO_PATH ||
        pathname.startsWith(`${ALLOWED_REPO_PATH}/`)
    );
}

module.exports = { isAllowedExternalUrl };
