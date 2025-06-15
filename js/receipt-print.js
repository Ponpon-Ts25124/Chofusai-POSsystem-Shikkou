// js/receipt-print.js

document.addEventListener('DOMContentLoaded', () => {
    // --- ★★★ ここにプリンターのIPアドレスを設定 ★★★ ---
    const PRINTER_IP_ADDRESS = '192.168.1.50'; // 例: セルフテストで確認したIPアドレス

    // URLから印刷データを取得
    const params = new URLSearchParams(window.location.search);
    const receiptData = JSON.parse(params.get('data'));

    if (!receiptData) {
        console.error('印刷データがありません。');
        window.close(); // データがなければウィンドウを閉じる
        return;
    }

    // 1. StarWebPrintBuilderオブジェクトを生成
    const builder = new StarWebPrint.Builder();

    // 2. レシートの内容を組み立てる
    builder.appendAlignment(StarWebPrint.AlignmentPosition.Center);
    // builder.appendLogo(StarWebPrint.LogoSize.Normal, 1); // ロゴを使う場合 (プリンターに事前登録が必要)
    builder.appendMultipleText(2, 2, '領収書\n'); // 縦横2倍
    builder.appendMultipleText(1, 1, '調布祭執行委員会\n\n'); // 通常サイズ
    builder.appendAlignment(StarWebPrint.AlignmentPosition.Left);
    builder.appendText(`日時: ${receiptData.timestamp}\n`);
    builder.appendText(`整理番号: ${receiptData.ticketNumber}\n`);
    builder.appendText('--------------------------------\n');

    // 商品リスト
    receiptData.items.forEach(item => {
        const name = item.name.padEnd(16, ' '); // 商品名を16文字幅で左揃え
        const qty = `x${item.quantity}`.padStart(4, ' ');
        const subtotal = `¥${item.price * item.quantity}`.padStart(8, ' ');
        builder.appendText(`${name}${qty}${subtotal}\n`);
    });

    builder.appendText('--------------------------------\n');
    builder.appendAlignment(StarWebPrint.AlignmentPosition.Right);
    builder.appendMultipleText(2, 2, `合計 ¥${receiptData.totalAmount}\n`);
    builder.appendMultipleText(1, 1, `(値引: ¥${receiptData.discountAmount})\n\n`);
    builder.appendAlignment(StarWebPrint.AlignmentPosition.Left);
    builder.appendText(`お支払方法: ${receiptData.paymentMethod}\n\n`);
    
    // 3. カット命令
    builder.appendCut(StarWebPrint.CutPaperAction.PartialCutWithFeed);

    // 4. StarWebPrintTraderオブジェクトを生成して印刷命令を送信
    const url = `http://${PRINTER_IP_ADDRESS}/StarWebPRNT/SendMessage`;
    const trader = new StarWebPrint.Trader({ url: url });

    trader.onReceive = (response) => {
        if (response.success) {
            console.log('印刷に成功しました。');
        } else {
            console.error('印刷に失敗しました:', response.status);
            alert('レシートの印刷に失敗しました。プリンターの接続を確認してください。');
        }
        // 成功・失敗にかかわらずウィンドウを閉じる
//        setTimeout(() => window.close(), 1000);
    };

    trader.onError = (error) => {
        console.error('プリンターとの通信に失敗しました:', error);
        alert('レシートプリンターとの通信に失敗しました。IPアドレスやネットワーク接続を確認してください。');
//        setTimeout(() => window.close(), 1000);
    };

    // 組み立てた印刷データを送信
//    trader.sendMessage({ request: builder.getCommands() });
// ★★★ 確認用のコードを追加 ★★★
console.log("--- レシート印刷データ ---");
console.log(receiptData); // 渡されたデータオブジェクトを表示
console.log("--- プリンター命令 (一部) ---");
console.log(builder.getCommands().substring(0, 200)); // 生成された命令の先頭部分を表示

alert('レシート印刷データがコンソールに出力されました。確認後、このウィンドウは手動で閉じてください。');
});