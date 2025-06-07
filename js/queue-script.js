// js/queue-script.js

document.addEventListener('DOMContentLoaded', () => {
    // 通常表示画面の要素
    const servingNumberSpan = document.getElementById('serving-number');
    const waitingCountSpan = document.getElementById('waiting-count');
    const lastIssuedNumberSpan = document.getElementById('last-issued-number');
    
    // 2段階表示画面の要素
    const makingListUl = document.getElementById('making-list');
    const readyListUl = document.getElementById('ready-list');
    
    const db = firebase.firestore();
    const queueStatusRef = db.collection('queue').doc('currentStatus');

    // キューの状態をリアルタイムで監視
    queueStatusRef.onSnapshot(doc => {
        if (!doc.exists) {
            console.warn("キューの状態ドキュメントが見つかりません。");
            return;
        }
        
        const data = doc.data();

        // --- 通常表示画面の更新 ---
        if (servingNumberSpan) {
            servingNumberSpan.textContent = data.servingTicket || '---';
        }
        if (waitingCountSpan) {
            waitingCountSpan.textContent = `現在の待ち人数: ${data.waitingCount || 0}人`;
        }
        if (lastIssuedNumberSpan) {
            lastIssuedNumberSpan.textContent = `最新の発行番号: ${data.lastIssuedTicket || 0}番`;
        }

        // --- 2段階表示画面の更新 ---
        // 作成中リストの更新
        if (makingListUl) {
            updateTicketList(makingListUl, data.makingTickets, data.servingTicket);
        }
        // 受取待ちリストの更新
        if (readyListUl) {
            updateTicketList(readyListUl, data.readyTickets, data.servingTicket);
        }

    }, error => {
        console.error("キューの監視エラー: ", error);
    });

    // リストを更新するヘルパー関数
    function updateTicketList(ulElement, ticketArray, servingTicket) {
        ulElement.innerHTML = ''; // リストをクリア
        
        if (!ticketArray || ticketArray.length === 0) {
            const li = document.createElement('li');
            li.className = 'no-tickets-message';
            li.textContent = '対象なし';
            ulElement.appendChild(li);
            return;
        }
        
        // 番号を昇順にソートして表示
        ticketArray.sort((a, b) => a - b).forEach(ticketNumber => {
            const li = document.createElement('li');
            li.textContent = ticketNumber;
            // 呼び出し中の番号に特別なスタイルを適用
            if (ticketNumber === servingTicket) {
                li.classList.add('now-serving');
            }
            ulElement.appendChild(li);
        });
    }
});