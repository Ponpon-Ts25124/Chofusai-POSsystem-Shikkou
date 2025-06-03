// js/queue-script.js
document.addEventListener('DOMContentLoaded', () => {
    console.log("queue-script.js: DOMContentLoaded triggered.");

    // 現在のHTMLファイル名を取得して処理を分岐
    const currentPagePath = window.location.pathname;
    const isNormalDisplayPage = currentPagePath.includes("queue-display-normal.html");
    const isDualDisplayPage = currentPagePath.includes("queue-display-dual.html");

    console.log("queue-script.js: Current page path:", currentPagePath, "isNormal:", isNormalDisplayPage, "isDual:", isDualDisplayPage);

    // 通常表示用要素
    const servingNumberSpan = document.getElementById('serving-number');
    const waitingCountSpan = document.getElementById('waiting-count');
    const lastIssuedNumberSpan = document.getElementById('last-issued-number');

    // 2段階表示用要素
    const makingListUl = document.getElementById('making-list');
    const readyListUl = document.getElementById('ready-list');

    if (typeof db === 'undefined') {
        console.error("queue-script.js: FATAL - Firestore 'db' instance is not defined. Check firebase-config.js.");
        // 適切なエラー表示
        if (isNormalDisplayPage && servingNumberSpan) servingNumberSpan.textContent = "DBエラー";
        if (isDualDisplayPage && makingListUl) makingListUl.innerHTML = "<li>DBエラー</li>";
        return;
    }
    console.log("queue-script.js: Firebase db instance IS available.");

    const queueStatusRef = db.collection('queue').doc('currentStatus');
    console.log("queue-script.js: Setting up Firestore listener for queue/currentStatus...");

    queueStatusRef.onSnapshot(doc => {
        console.log("queue-script.js: onSnapshot triggered. Document exists:", doc.exists);
        if (!doc.exists) {
            console.warn("queue-script.js: Queue status document does not exist.");
            // デフォルト表示またはエラーメッセージ
            if (isNormalDisplayPage) {
                if(servingNumberSpan) servingNumberSpan.textContent = "---";
                if(waitingCountSpan) waitingCountSpan.textContent = "現在の待ち人数: ---人";
                if(lastIssuedNumberSpan) lastIssuedNumberSpan.textContent = "最新の発行番号: ---番";
            } else if (isDualDisplayPage) {
                if(makingListUl) makingListUl.innerHTML = '<li class="no-tickets-message">データなし</li>';
                if(readyListUl) readyListUl.innerHTML = '<li class="no-tickets-message">データなし</li>';
            }
            return;
        }
        const data = doc.data();
        console.log("queue-script.js: Queue data received:", JSON.stringify(data, null, 2));

        if (isNormalDisplayPage) {
            console.log("queue-script.js: Rendering NORMAL display.");
            renderNormalDisplay(data);
        } else if (isDualDisplayPage) {
            console.log("queue-script.js: Rendering DUAL display.");
            renderDualDisplay(data);
        }
    }, err => {
        console.error("queue-script.js: Error listening to queue status: ", err);
        // エラー時の表示処理
        if (isNormalDisplayPage && servingNumberSpan) servingNumberSpan.textContent = "エラー";
        if (isDualDisplayPage && makingListUl) makingListUl.innerHTML = "<li>読込エラー</li>";
    });

    function renderNormalDisplay(data) {
        console.log("queue-script.js: renderNormalDisplay called with data:", data);
        if(servingNumberSpan) servingNumberSpan.textContent = data.servingTicket || 0;
        if(waitingCountSpan) waitingCountSpan.textContent = `現在の待ち人数: ${data.waitingCount || 0}人`;
        if(lastIssuedNumberSpan) lastIssuedNumberSpan.textContent = `最新の発行番号: ${data.lastIssuedTicket || 0}番`;
    }

    function renderDualDisplay(data) {
        console.log("queue-script.js: renderDualDisplay called with data:", data);
        const makingTickets = data.makingTickets || [];
        const readyTickets = data.readyTickets || [];
        const servingTicket = data.servingTicket || 0;

        if (makingListUl) {
            makingListUl.innerHTML = '';
            if (makingTickets.length === 0) {
                const li = document.createElement('li'); li.classList.add('no-tickets-message'); li.textContent = '作成中なし'; makingListUl.appendChild(li);
                console.log("queue-script.js: No making tickets for dual display.");
            } else {
                console.log("queue-script.js: Making tickets for dual display:", makingTickets);
                makingTickets.forEach(ticket => { const li = document.createElement('li'); li.textContent = ticket; makingListUl.appendChild(li); });
            }
        } else if (isDualDisplayPage) { // isDualDisplayPage の時だけエラーを出す
            console.error("queue-script.js: ERROR - makingListUl element not found in the DOM for dual display!");
        }

        if (readyListUl) {
            readyListUl.innerHTML = '';
            if (readyTickets.length === 0) {
                const li = document.createElement('li'); li.classList.add('no-tickets-message'); li.textContent = '受取待ちなし'; readyListUl.appendChild(li);
                console.log("queue-script.js: No ready tickets for dual display.");
            } else {
                console.log("queue-script.js: Ready tickets for dual display:", readyTickets, "Serving:", servingTicket);
                readyTickets.forEach(ticket => {
                    const li = document.createElement('li'); li.textContent = ticket;
                    if (ticket === servingTicket && readyTickets[0] === ticket) { li.classList.add('now-serving'); }
                    readyListUl.appendChild(li);
                });
            }
        } else if (isDualDisplayPage) { // isDualDisplayPage の時だけエラーを出す
            console.error("queue-script.js: ERROR - readyListUl element not found in the DOM for dual display!");
        }
    }
});