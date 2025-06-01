// js/kitchen-script.js
document.addEventListener('DOMContentLoaded', () => {
    const kitchenOrderListDiv = document.getElementById('kitchen-order-list');

    if (typeof db === 'undefined') {
        console.error("Firestore 'db' instance is not defined in kitchen-script.");
        if (kitchenOrderListDiv) kitchenOrderListDiv.innerHTML = '<p style="color:red;">データベース接続エラー</p>';
        return;
    }

    console.log("kitchen-script.js: Setting up Firestore listener for kitchenQueue...");

    db.collection('kitchenQueue')
      .orderBy('orderTimestamp', 'asc')
      .onSnapshot(snapshot => {
        console.log("kitchen-script.js: kitchenQueue snapshot received. Empty:", snapshot.empty, "Size:", snapshot.size);
        if (!kitchenOrderListDiv) {
            console.error("kitchenOrderListDiv is not found!");
            return;
        }
        kitchenOrderListDiv.innerHTML = '';

        if (snapshot.empty) {
            console.log("kitchen-script.js: No orders in kitchen queue.");
            kitchenOrderListDiv.innerHTML = '<p>現在、作成待ちの注文はありません。</p>';
            return;
        }

        snapshot.forEach(doc => {
            const order = doc.data();
            console.log("kitchen-script.js: Processing order data:", order);

            if (order.orderTimestamp && typeof order.orderTimestamp.toDate === 'function') {
                const orderCard = createOrderCard(order);
                kitchenOrderListDiv.appendChild(orderCard);
            } else {
                console.warn("kitchen-script.js: Skipping order due to invalid or missing orderTimestamp:", JSON.stringify(order));
            }
        });
    }, error => {
        console.error("kitchen-script.js: Error fetching kitchen queue: ", error);
        if (kitchenOrderListDiv) kitchenOrderListDiv.innerHTML = `<p style="color:red;">リストの読み込みに失敗しました。エラー: ${error.message}</p>`;
    });

    function createOrderCard(order) {
        const card = document.createElement('div');
        card.classList.add('order-card');
        card.dataset.ticketNumber = order.ticketNumber;

        const orderTime = order.orderTimestamp.toDate();
        const timeElapsedMs = Date.now() - orderTime.getTime();
        const minutesElapsed = Math.floor(timeElapsedMs / (1000 * 60));
        const secondsElapsed = Math.floor((timeElapsedMs % (1000 * 60)) / 1000);

        if (minutesElapsed >= 10) card.classList.add('urgent');

        let itemsHtml = '<ul class="order-items-list">';
        if (order.items && Array.isArray(order.items)) {
            order.items.forEach(item => {
                itemsHtml += `<li><span class="item-name">${item.name || '商品名不明'}</span>: <span class="item-quantity">${item.quantity || 0}個</span></li>`;
            });
        }
        itemsHtml += '</ul>';

        card.innerHTML = `
            <div class="order-header">
                <h3>整理番号: ${order.ticketNumber}</h3>
                <span class="time-elapsed" data-timestamp="${orderTime.getTime()}">経過: ${minutesElapsed}分 ${secondsElapsed}秒</span>
            </div>
            ${itemsHtml}
        `;
        return card;
    }

    setInterval(() => {
        const timeSpans = document.querySelectorAll('.order-card .time-elapsed');
        timeSpans.forEach(span => {
            const orderTimestamp = parseInt(span.dataset.timestamp, 10);
            if (isNaN(orderTimestamp)) return;

            const timeElapsedMs = Date.now() - orderTimestamp;
            const minutesElapsed = Math.floor(timeElapsedMs / (1000 * 60));
            const secondsElapsed = Math.floor((timeElapsedMs % (1000 * 60)) / 1000);
            span.textContent = `経過: ${minutesElapsed}分 ${secondsElapsed}秒`;

            const card = span.closest('.order-card');
            if (card) {
                if (minutesElapsed >= 10 && !card.classList.contains('urgent')) {
                    card.classList.add('urgent');
                } else if (minutesElapsed < 10 && card.classList.contains('urgent')) {
                    card.classList.remove('urgent');
                }
            }
        });
    }, 10000);
});