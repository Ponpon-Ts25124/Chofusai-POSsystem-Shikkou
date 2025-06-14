// js/customer-display-script.js
document.addEventListener('DOMContentLoaded', () => {
    const cartItemsUl = document.getElementById('customer-cart-items');
    const totalAmountSpan = document.getElementById('customer-total-amount');
    const paymentImage = document.getElementById('payment-image');
    const db = firebase.firestore();

    // ★画像ファイル名をマッピング
    const IMAGE_MAP = {
        menu: 'img/menu.jpg',
        cash: 'img/payment_cash.jpeg',
        credit_card: 'img/payment_credit.png',
        e_money: 'img/payment_emoney.png',
        ic_card: 'img/payment_ic.png',
        qr_code: 'img/payment_qr.png'
    };

    // FirestoreのcustomerDisplay/currentCartドキュメントをリアルタイムで監視
    db.collection('customerDisplay').doc('currentCart')
      .onSnapshot(doc => {
        if (!doc.exists) {
            console.warn("顧客表示用のデータが見つかりません。");
            return;
        }
        const data = doc.data();
        
        // 1. カート内容を更新
        cartItemsUl.innerHTML = '';
        (data.items || []).forEach(item => {
            const li = document.createElement('li');
            li.className = 'customer-cart-item';
            li.innerHTML = `
                <span class="customer-item-name">${item.name}</span>
                <span class="customer-item-qty">×${item.quantity}</span>
                <span class="customer-item-subtotal">¥${item.subtotal}</span>
            `;
            cartItemsUl.appendChild(li);
        });
        
        // 2. 合計金額を更新
        totalAmountSpan.textContent = data.total || 0;

        // 3. 支払いステータスに応じて画像を更新
        const status = data.paymentStatus || 'menu';
        const newImageSrc = IMAGE_MAP[status] || IMAGE_MAP['menu']; // 不明な場合はメニュー画像

        // 現在の画像と新しい画像が違う場合のみ、画像を更新（ちらつき防止）
        if (paymentImage.src !== newImageSrc) {
            paymentImage.src = newImageSrc;
        }
        
    }, error => {
        console.error("顧客表示画面のデータ監視エラー:", error);
    });
});