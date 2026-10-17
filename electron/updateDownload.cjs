// 自前で落とす更新ファイル（portable 版のインストーラ、macOS の DMG）の検証。
// electron に依存させないのは、判定だけを単体テストできるようにするため。
const crypto = require('node:crypto');
const fs = require('node:fs');

const RELEASE_DOWNLOAD_PATH =
    '/Flint8777/Reflectance-Spectra/releases/download/';
// browser_download_url からの 302 先。GitHub 側の移行で変わるので両方許可しておく
const ASSET_CDN_HOSTS = [
    'release-assets.githubusercontent.com',
    'objects.githubusercontent.com',
];

// リダイレクトの各段で呼ぶ。最初の URL は本リポジトリの Release 配下に限る
function isAllowedDownloadUrl(url) {
    if (typeof url !== 'string') return false;
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username !== '' || parsed.password !== '') return false;
    // host はポート込みなので、ポート指定付きもここで弾かれる
    if (parsed.host === 'github.com') {
        return parsed.pathname.startsWith(RELEASE_DOWNLOAD_PATH);
    }
    return ASSET_CDN_HOSTS.includes(parsed.host);
}

// Releases API の asset.digest（"sha256:<hex>"）から hex を取り出す
function parseSha256Digest(digest) {
    if (typeof digest !== 'string') return null;
    const m = /^sha256:([0-9a-f]{64})$/i.exec(digest);
    return m ? m[1].toLowerCase() : null;
}

// 保存先のファイル名にそのまま使うので、区切り文字や `..` を含む名前は拒否する
function isSafeAssetName(name) {
    if (typeof name !== 'string') return false;
    if (name === '.' || name === '..') return false;
    return /^[\w.-]+$/.test(name);
}

function verifySha256(file, expectedHex) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        fs.createReadStream(file)
            .on('data', (chunk) => hash.update(chunk))
            .on('error', reject)
            .on('end', () => {
                const actual = hash.digest('hex');
                if (actual === expectedHex) {
                    resolve();
                } else {
                    reject(
                        new Error(
                            `sha256 mismatch: expected ${expectedHex}, got ${actual}`,
                        ),
                    );
                }
            });
    });
}

module.exports = {
    isAllowedDownloadUrl,
    isSafeAssetName,
    parseSha256Digest,
    verifySha256,
};
