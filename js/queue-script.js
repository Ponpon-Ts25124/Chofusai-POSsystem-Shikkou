document.addEventListener('DOMContentLoaded', () => {
    const servingNumberSpan = document.getElementById('serving-number');
    const waitingCountSpan = document.getElementById('waiting-count');
    const lastIssuedNumberSpan = document.getElementById('last-issued-number');

    const queueStatusRef = db.collection('queue').doc('currentStatus');

    queueStatusRef.onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            servingNumberSpan.textContent = data.servingTicket || 0;
            waitingCountSpan.textContent = `現在の待ち人数: ${data.waitingCount || 0}人`;
            lastIssuedNumberSpan.textContent = `最新の発行番号: ${data.lastIssuedTicket || 0}番`;
        } else {
            servingNumberSpan.textContent = "N/A";
            waitingCountSpan.textContent = "現在の待ち人数: N/A";
            lastIssuedNumberSpan.textContent = "最新の発行番号: N/A";
            console.log("Queue status document not found, POS admin needs to initialize.");
        }
    }, err => {
        console.error("Error listening to queue status: ", err);
        servingNumberSpan.textContent = "エラー";
        waitingCountSpan.textContent = "データ取得に失敗しました。";
        lastIssuedNumberSpan.textContent = "";
    });
});