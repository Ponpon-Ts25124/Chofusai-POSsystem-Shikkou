// js/queue-script.js
document.addEventListener('DOMContentLoaded', () => {
    const servingNumberSpan = document.getElementById('serving-number');
    const waitingCountSpan = document.getElementById('waiting-count');
    const lastIssuedNumberSpan = document.getElementById('last-issued-number');

    if (typeof db === 'undefined') {
        console.error("Firestore 'db' instance is not defined in queue-script.");
        if(servingNumberSpan) servingNumberSpan.textContent = "DBエラー";
        return;
    }

    const queueStatusRef = db.collection('queue').doc('currentStatus');

    queueStatusRef.onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            if(servingNumberSpan) servingNumberSpan.textContent = data.servingTicket || 0;
            if(waitingCountSpan) waitingCountSpan.textContent = `現在の待ち人数: ${data.waitingCount || 0}人`;
            if(lastIssuedNumberSpan) lastIssuedNumberSpan.textContent = `最新の発行番号: ${data.lastIssuedTicket || 0}番`;
        } else {
            if(servingNumberSpan) servingNumberSpan.textContent = "N/A";
            if(waitingCountSpan) waitingCountSpan.textContent = "現在の待ち人数: N/A";
            if(lastIssuedNumberSpan) lastIssuedNumberSpan.textContent = "最新の発行番号: N/A";
            console.log("Queue status document not found.");
        }
    }, err => {
        console.error("Error listening to queue status: ", err);
        if(servingNumberSpan) servingNumberSpan.textContent = "エラー";
        if(waitingCountSpan) waitingCountSpan.textContent = "データ取得に失敗しました。";
        if(lastIssuedNumberSpan) lastIssuedNumberSpan.textContent = "";
    });
});