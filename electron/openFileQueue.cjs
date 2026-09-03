// 関連付け・起動引数で渡されたファイルを renderer へ届けるまでの受け皿。
//
// 起動直後は renderer がまだ購読していないので、送っても捨てられる（v2.12.0 で
// 実際にこれが起き、ダブルクリックしたファイルが読まれなかった）。かといって
// 送信と保留の両方に置くと、renderer が起動時の取得と購読の二重で受け取り、
// 貯めたぶんは誰も引き取らずに残り続ける。
// そこで「最初に取りに来るまでは貯める・以降は送るだけ」を排他で切り替える。
//
// electron に依存させないのは、この順序をテストで固定するため。
class OpenFileQueue {
    constructor({ send }) {
        this.pending = [];
        this.rendererReady = false;
        this.send = send;
    }

    // ウィンドウを作り直すと購読も作り直しになるので、未準備へ戻す
    markRendererNotReady() {
        this.rendererReady = false;
    }

    add(payload) {
        if (!payload?.length) return;
        if (this.rendererReady && this.send(payload)) return;
        this.pending.push(...payload);
    }

    take() {
        this.rendererReady = true;
        const files = this.pending;
        this.pending = [];
        return files;
    }
}

module.exports = { OpenFileQueue };
