// js/receipt-print.js

document.addEventListener('DOMContentLoaded', () => {
    // --- ★★★ ここにプリンターのIPアドレスを設定 ★★★ ---
    const PRINTER_IP_ADDRESS = '192.168.1.50'; // 例: セルフテストで確認したIPアドレス

    // ★★★ localStorageから印刷データを取得 ★★★
    const receiptDataString = localStorage.getItem('receiptDataForPrint');
    
    // 取得後、すぐにlocalStorageからデータを削除（リロードで再印刷されるのを防ぐ）
    localStorage.removeItem('receiptDataForPrint');

    if (!receiptDataString) {
        console.error('印刷データがlocalStorageにありません。');
        // window.close(); // データがなければウィンドウを閉じる
        return;
    }

    const receiptData = JSON.parse(receiptDataString);

    // 1. StarWebPrintBuilderオブジェクトを生成
    const builder = new StarWebPrint.Builder();

    // 2. レシートの内容を組み立てる (この部分は変更なし)
    builder.appendAlignment(StarWebPrint.AlignmentPosition.Center);
    // builder.appendLogo(StarWebPrint.LogoSize.Normal, 1);
    builder.appendMultipleText(2, 2, '領収書\n');
    builder.appendMultipleText(1, 1, '調布祭執行委員会\n\n');
    builder.appendAlignment(StarWebPrint.AlignmentPosition.Left);
    builder.appendText(`日時: ${receiptData.timestamp}\n`);
    builder.appendText(`整理番号: ${receiptData.ticketNumber}\n`);
    builder.appendText('--------------------------------\n');
    receiptData.items.forEach(item => {
        const name = item.name.padEnd(16, ' ');
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
        setTimeout(() => window.close(), 1000);
    };

    trader.onError = (error) => {
        console.error('プリンターとの通信に失敗しました:', error);
        alert('レシートプリンターとの通信に失敗しました。IPアドレスやネットワーク接続を確認してください。');
        setTimeout(() => window.close(), 1000);
    };


    // ★★★ 確認用のコード ★★★
    console.log("--- localStorageから取得したレシート印刷データ ---");
    console.log(receiptData);
    console.log("--- プリンター命令 (一部) ---");
    console.log(builder.getCommands().substring(0, 200)); 
    
    alert('レシート印刷データがコンソールに出力されました。確認後、このウィンドウは手動で閉じてください。');

    // 組み立てた印刷データを送信
    trader.sendMessage({ request: builder.getCommands() }); // ★確認が終わったらこの行のコメントを外す
});