// js/kitchen-prep-script.js
document.addEventListener('DOMContentLoaded', () => {
    const prepListDiv = document.getElementById('kitchen-prep-list');
    if (!prepListDiv) return;

    const db = firebase.firestore();

    // kitchenQueueコレクションをリアルタイムで監視
    db.collection('kitchenQueue').orderBy('orderTimestamp', 'asc')
      .onSnapshot(snapshot => {
        prepListDiv.innerHTML = ''; // 毎回リストをクリア

        if (snapshot.empty) {
            prepListDiv.innerHTML = '<p>現在、作成指示はありません。</p>';
            return;
        }

        snapshot.forEach(doc => {
            const order = doc.data();
            const card = document.createElement('div');
            card.className = 'prep-card'; // CSSで定義したスタイルを適用
            const itemsHtml = order.items.map(item => `<li><span>${item.name}</span><span>x ${item.quantity}</span></li>`).join('');
            
            card.innerHTML = `
                <div class="prep-card-header">整理番号: ${order.ticketNumber}</div>
                <ul class="prep-card-list">${itemsHtml}</ul>
            `;
            prepListDiv.appendChild(card);
        });
    }, error => {
        console.error("作成指示リストの監視エラー: ", error);
        prepListDiv.innerHTML = '<p style="color:red;">データの取得に失敗しました。</p>';
    });
});