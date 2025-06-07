// js/kitchen-script.js

document.addEventListener('DOMContentLoaded', () => {
    const kitchenOrderListDiv = document.getElementById('kitchen-order-list');
    const db = firebase.firestore();

    // kitchenQueueコレクションをリアルタイムで監視
    db.collection('kitchenQueue')
      .orderBy('orderTimestamp', 'asc')
      .onSnapshot(snapshot => {
          kitchenOrderListDiv.innerHTML = ''; // リストをクリア

          if (snapshot.empty) {
              kitchenOrderListDiv.innerHTML = '<p>現在、作成待ちの注文はありません。</p>';
              return;
          }

          snapshot.forEach(doc => {
              const order = doc.data();
              const orderCard = createOrderCard(order);
              kitchenOrderListDiv.appendChild(orderCard);
          });
      }, error => {
          console.error("厨房リストの監視エラー: ", error);
          kitchenOrderListDiv.innerHTML = '<p style="color: red;">データの取得に失敗しました。</p>';
      });

    // 注文カードのHTMLを生成する関数
    function createOrderCard(order) {
        const card = document.createElement('div');
        card.className = 'order-card';
        card.id = `order-${order.ticketNumber}`;

        const itemsHtml = order.items.map(item => 
            `<li class="order-items-list-item">
                <span class="item-name">${item.name}</span>
                <span class="item-quantity">x ${item.quantity}</span>
            </li>`
        ).join('');

        const timeElapsed = calculateTimeElapsed(order.orderTimestamp);

        card.innerHTML = `
            <div class="order-header">
                <h3>整理番号: ${order.ticketNumber}</h3>
                <span class="time-elapsed">${timeElapsed}</span>
            </div>
            <ul class="order-items-list">
                ${itemsHtml}
            </ul>
            <button class="complete-btn" data-ticket-number="${order.ticketNumber}">調理完了</button>
        `;

        // 「調理完了」ボタンにイベントリスナーを設定
        card.querySelector('.complete-btn').addEventListener('click', handleCompletion);

        return card;
    }

    // 調理完了ボタンが押されたときの処理
    async function handleCompletion(event) {
        const ticketNumber = parseInt(event.target.dataset.ticketNumber);
        if (isNaN(ticketNumber)) return;
        
        if (!confirm(`整理番号 ${ticketNumber} を調理完了にしますか？`)) return;

        const db = firebase.firestore();
        const queueStatusRef = db.collection('queue').doc('currentStatus');

        try {
            // トランザクションでキューの状態を更新
            await db.runTransaction(async (transaction) => {
                const queueDoc = await transaction.get(queueStatusRef);
                if (!queueDoc.exists) throw "キューの状態ドキュメントが見つかりません。";

                let makingTickets = queueDoc.data().makingTickets || [];
                // makingTicketsから完了した番号を削除
                makingTickets = makingTickets.filter(num => num !== ticketNumber);

                transaction.update(queueStatusRef, {
                    makingTickets: makingTickets,
                    readyTickets: firebase.firestore.FieldValue.arrayUnion(ticketNumber)
                });
            });

            // kitchenQueueから完了した注文を削除
            await db.collection('kitchenQueue').doc(String(ticketNumber)).delete();

            console.log(`整理番号 ${ticketNumber} を完了しました。`);
        } catch (error) {
            console.error("調理完了処理エラー: ", error);
            alert("調理完了処理中にエラーが発生しました。");
        }
    }

    // 経過時間を計算する関数
    function calculateTimeElapsed(timestamp) {
        if (!timestamp) return '---';
        const now = new Date();
        const orderTime = timestamp.toDate();
        const diffMinutes = Math.floor((now - orderTime) / 60000);
        return `${diffMinutes}分前`;
    }
});