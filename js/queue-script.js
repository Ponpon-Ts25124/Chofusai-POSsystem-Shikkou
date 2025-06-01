// js/queue-script.js
document.addEventListener('DOMContentLoaded', () => {
    const normalDisplayDiv = document.getElementById('normal-display');
    const dualDisplayDiv = document.getElementById('dual-display');

    const servingNumberSpan = document.getElementById('serving-number');
    const waitingCountSpan = document.getElementById('waiting-count');
    const lastIssuedNumberSpan = document.getElementById('last-issued-number');

    const makingListUl = document.getElementById('making-list');
    const readyListUl = document.getElementById('ready-list');
    // const dualServingNumberSpan = document.getElementById('dual-serving-number'); // オプション

    if (typeof db === 'undefined') {
        console.error("Firestore 'db' instance is not defined in queue-script.");
        // エラー表示など
        return;
    }
    const queueStatusRef = db.collection('queue').doc('currentStatus');

    queueStatusRef.onSnapshot(doc => {
        if (!normalDisplayDiv || !dualDisplayDiv) { // 要素がない場合は処理中断
            console.error("Display divs not found in queue-script.");
            return;
        }

        if (!doc.exists) {
            console.log("Queue status document not found in queue-script.");
            normalDisplayDiv.style.display = 'block';
            dualDisplayDiv.style.display = 'none';
            if(servingNumberSpan) servingNumberSpan.textContent = "---";
            if(waitingCountSpan) waitingCountSpan.textContent = "現在の待ち人数: ---人";
            if(lastIssuedNumberSpan) lastIssuedNumberSpan.textContent = "最新の発行番号: ---番";
            return;
        }
        const data = doc.data();
        const displayMode = data.displayMode || "normal";

        if (displayMode === "dual") {
            normalDisplayDiv.style.display = 'none';
            dualDisplayDiv.style.display = 'block'; // または 'flex'など適切な表示
            renderDualDisplay(data);
        } else {
            normalDisplayDiv.style.display = 'block';
            dualDisplayDiv.style.display = 'none';
            renderNormalDisplay(data);
        }
    }, err => {
        console.error("Error listening to queue status in queue-script: ", err);
    });

    function renderNormalDisplay(data) {
        if(servingNumberSpan) servingNumberSpan.textContent = data.servingTicket || 0;
        if(waitingCountSpan) waitingCountSpan.textContent = `現在の待ち人数: ${data.waitingCount || 0}人`;
        if(lastIssuedNumberSpan) lastIssuedNumberSpan.textContent = `最新の発行番号: ${data.lastIssuedTicket || 0}番`;
    }

    function renderDualDisplay(data) {
        const makingTickets = data.makingTickets || [];
        const readyTickets = data.readyTickets || [];
        const servingTicket = data.servingTicket || 0; // このservingTicketは主にreadyTicketsの先頭を指す

        if (makingListUl) {
            makingListUl.innerHTML = '';
            if (makingTickets.length === 0) {
                const li = document.createElement('li');
                li.classList.add('no-tickets-message');
                li.textContent = '作成中なし';
                makingListUl.appendChild(li);
            } else {
                makingTickets.forEach(ticket => {
                    const li = document.createElement('li');
                    li.textContent = ticket;
                    makingListUl.appendChild(li);
                });
            }
        }

        if (readyListUl) {
            readyListUl.innerHTML = '';
            if (readyTickets.length === 0) {
                const li = document.createElement('li');
                li.classList.add('no-tickets-message');
                li.textContent = '受取待ちなし';
                readyListUl.appendChild(li);
            } else {
                readyTickets.forEach(ticket => {
                    const li = document.createElement('li');
                    li.textContent = ticket;
                    // 「呼び出し中」の強調は、readyTickets の先頭の番号が servingTicket と一致する場合
                    if (ticket === servingTicket && readyTickets.indexOf(ticket) === 0) {
                        li.classList.add('now-serving');
                    }
                    readyListUl.appendChild(li);
                });
            }
        }
        // if (dualServingNumberSpan) {
        //      dualServingNumberSpan.textContent = `呼び出し中: ${servingTicket > 0 ? servingTicket : '---'}`;
        // }
    }
});