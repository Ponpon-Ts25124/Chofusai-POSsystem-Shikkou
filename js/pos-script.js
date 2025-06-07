// js/pos-script.js

document.addEventListener('DOMContentLoaded', () => {
    console.log("pos-script.js: DOMContentLoaded triggered.");

    // --- 1. 要素の取得 ---
    const loginModal = document.getElementById('login-modal');
    const loginSubmitButton = document.getElementById('login-submit-button');
    const cartItemsTbody = document.getElementById('cart-items-tbody'); 
    const totalAmountSpan = document.getElementById('total-amount');
    const checkoutCashBtn = document.getElementById('checkout-cash-btn');
    const productListDiv = document.getElementById('product-list');
    const serviceListDiv = document.getElementById('service-list');
    const operationListDiv = document.getElementById('operation-list');
    const logoutButton = document.getElementById('footer-logout-btn');
    const cancelCartFooterBtn = document.getElementById('footer-cancel-btn');
    const paymentConfirmModal = document.getElementById('payment-confirm-modal');
    const modalTotalAmountSpan = document.getElementById('modal-total-amount');
    const modalAmountReceivedInput = document.getElementById('modal-amount-received');
    const keypadContainer = document.getElementById('keypad-container');
    const modalChangeDisplayP = document.getElementById('modal-change-display');
    const confirmPaymentButton = document.getElementById('confirm-payment-button');
    const closePaymentModalButton = document.getElementById('close-payment-modal-button');
    const cancelPaymentButton = document.getElementById('cancel-payment-button');

    // --- 2. グローバル変数 ---
    let cart = []; 
    let products = [];
    const db = firebase.firestore();
    const queueStatusRef = db.collection('queue').doc('currentStatus');

    // --- 3. 関数の定義 ---
    
    // Firestoreから商品データを取得
    async function fetchProducts() {
        try {
            const snapshot = await db.collection('products').orderBy('order', 'asc').get();
            products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderProducts();
        } catch (error) {
            console.error("商品データの読み込みエラー: ", error);
            if (productListDiv) productListDiv.innerHTML = '<p style="color: red;">商品読込失敗</p>';
        }
    }

    // 商品ボタンを描画
    function renderProducts() {
        if (!productListDiv) return;
        productListDiv.innerHTML = ''; 
        if (products.length === 0) {
            productListDiv.innerHTML = '<p>商品なし</p>';
            return;
        }
        products.forEach((product, index) => {
            const button = document.createElement('button');
            button.textContent = product.name;
            button.addEventListener('click', () => addToCart(product));
            productListDiv.appendChild(button);
        });
    }

    // カートに商品を追加
    function addToCart(product) {
        const existingItem = cart.find(item => item.id === product.id);
        if (existingItem) {
            existingItem.quantity++;
        } else {
            cart.push({ ...product, quantity: 1 });
        }
        renderCart();
    }
    
    // カートから商品を削除
    function removeFromCart(productId) {
        const itemIndex = cart.findIndex(item => item.id === productId);
        if (itemIndex > -1) {
            if (cart[itemIndex].quantity > 1) {
                cart[itemIndex].quantity--;
            } else {
                cart.splice(itemIndex, 1);
            }
        }
        renderCart();
    }

    // カートを描画
    function renderCart() {
        if (!cartItemsTbody || !totalAmountSpan) return;
        cartItemsTbody.innerHTML = '';
        let total = 0;

        if (cart.length > 0) {
            const headerRow = cartItemsTbody.insertRow();
            headerRow.className = 'table-header';
            headerRow.innerHTML = `<td>取消</td><td>商品名</td><td style="text-align: right;">単価</td><td style="text-align: right;">数量</td><td style="text-align: right;">金額</td>`;
        }

        cart.forEach(item => {
            const row = cartItemsTbody.insertRow();
            const subtotal = item.price * item.quantity;
            total += subtotal;
            const removeButtonHTML = `<button class="remove-item-btn" data-item-id="${item.id}">-</button>`;
            row.innerHTML = `<td>${removeButtonHTML}</td><td>${item.name}</td><td style="text-align: right;">${item.price}</td><td style="text-align: right;">${item.quantity}</td><td style="text-align: right;">${subtotal}</td>`;
        });
        
        cartItemsTbody.querySelectorAll('.remove-item-btn').forEach(button => {
            button.addEventListener('click', (e) => removeFromCart(e.target.dataset.itemId));
        });
        totalAmountSpan.textContent = total;
    }

    // 会計モーダルを開く
    function openPaymentModal() {
        if (cart.length === 0) { alert("カートが空です。"); return; }
        if (!paymentConfirmModal) { console.error("会計モーダル関連の要素が見つかりません。"); return; }
        const total = parseFloat(totalAmountSpan.textContent) || 0;
        modalTotalAmountSpan.textContent = total;
        modalAmountReceivedInput.value = total; // ★お預かり金額の初期値を合計金額にする
        generateKeypad();
        calculateModalChange();
        paymentConfirmModal.classList.remove('hidden');
    }

    // 会計モーダルを閉じる
    function closePaymentModal() {
        if (paymentConfirmModal) paymentConfirmModal.classList.add('hidden');
    }

    // キーパッドを生成
    function generateKeypad() {
        if (!keypadContainer) return;
        keypadContainer.innerHTML = '';
        const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', 'BS'];
        keys.forEach(key => {
            const button = document.createElement('button');
            button.textContent = key;
            if (key === 'C') button.addEventListener('click', () => { modalAmountReceivedInput.value = '0'; calculateModalChange(); });
            else if (key === 'BS') button.addEventListener('click', () => { modalAmountReceivedInput.value = modalAmountReceivedInput.value.slice(0, -1) || '0'; calculateModalChange(); });
            else button.addEventListener('click', () => { if (modalAmountReceivedInput.value === '0') modalAmountReceivedInput.value = key; else modalAmountReceivedInput.value += key; calculateModalChange(); });
            keypadContainer.appendChild(button);
        });
    }

    // お釣りを計算
    function calculateModalChange() {
        const total = parseFloat(modalTotalAmountSpan.textContent) || 0;
        const received = parseFloat(modalAmountReceivedInput.value) || 0;
        let change = received - total;
        modalChangeDisplayP.classList.remove('不足');
        if (received >= total) {
            modalChangeDisplayP.innerHTML = `お釣り: <span id="modal-change-amount">${change}</span> 円`;
        } else {
            modalChangeDisplayP.innerHTML = `不足額: <span id="modal-change-amount">${Math.abs(change)}</span> 円`;
            modalChangeDisplayP.classList.add('不足');
        }
    }

    // ログイン・ログアウト処理
    function setupLoginSystem() {
        loginModal?.classList.remove('hidden');
        loginSubmitButton?.addEventListener('click', () => loginModal.classList.add('hidden'));
        logoutButton?.addEventListener('click', () => {
            if (confirm('ログアウトしますか？')) {
                cart = []; renderCart();
                loginModal.classList.remove('hidden');
            }
        });
    }

    // サービスボタンを生成
    function setupServiceButtons() {
        if (!serviceListDiv) return;
        serviceListDiv.innerHTML = '';
        const items = [
            { id: 'service-ice-large', name: '+氷(多め)', price: 100 },
            { id: 'service-ice-small', name: '+氷(少なめ)', price: 100 }
        ];
        items.forEach(item => {
            const button = document.createElement('button');
            button.textContent = item.name;
            button.addEventListener('click', () => addToCart(item));
            serviceListDiv.appendChild(button);
        });
    }

    // 業務ボタンを生成
    function setupOperationButtons() {
        if (!operationListDiv) return;
        operationListDiv.innerHTML = '';
        const items = ['レジ点検', '販売数確認', '値引き', '売上外入金'];
        items.forEach(name => {
            const button = document.createElement('button');
            button.textContent = name;
            button.addEventListener('click', () => alert(`「${name}」は未実装です。`));
            operationListDiv.appendChild(button);
        });
    }


    // --- 4. イベントリスナーの設定 ---
    checkoutCashBtn?.addEventListener('click', openPaymentModal);
    cancelCartFooterBtn?.addEventListener('click', () => {
        if (cart.length > 0 && confirm('カートを空にしますか？')) {
            cart = []; renderCart();
        }
    });
    closePaymentModalButton?.addEventListener('click', closePaymentModal);
    cancelPaymentButton?.addEventListener('click', closePaymentModal);

    // ★★★★★ 支払い確定ボタンの処理 (Firestore連携部分を完全実装) ★★★★★
    confirmPaymentButton?.addEventListener('click', async () => {
        const totalAmount = parseFloat(modalTotalAmountSpan.textContent) || 0;
        const amountReceived = parseFloat(modalAmountReceivedInput.value) || 0;
        if (amountReceived < totalAmount) {
            alert("お預かり金額が不足しています。");
            return;
        }

        closePaymentModal();
        const changeGiven = amountReceived - totalAmount;
        
        try {
            // 1. 新しい整理番号を発行 (トランザクション処理)
            const newTicketNumber = await db.runTransaction(async (transaction) => {
                const queueDoc = await transaction.get(queueStatusRef);
                const lastIssuedTicket = queueDoc.exists ? (queueDoc.data().lastIssuedTicket || 0) : 0;
                const newTicket = lastIssuedTicket + 1;
                
                const updateData = {
                    lastIssuedTicket: newTicket,
                    makingTickets: firebase.firestore.FieldValue.arrayUnion(newTicket),
                    waitingCount: firebase.firestore.FieldValue.increment(1)
                };
                
                if (!queueDoc.exists) {
                    transaction.set(queueStatusRef, { ...updateData, readyTickets: [], servingTicket: 0 });
                } else {
                    transaction.update(queueStatusRef, updateData);
                }
                return newTicket;
            });

            // 2. 売上情報を `sales` コレクションに保存
            await db.collection('sales').add({
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                items: cart.map(item => ({ productId: item.id, name: item.name, price: item.price, quantity: item.quantity })),
                totalAmount,
                amountReceived,
                changeGiven,
                ticketNumber: newTicketNumber,
                status: "completed"
            });

            // 3. 厨房用のキューに注文情報を保存
            const kitchenOrderItems = cart.map(item => ({ name: item.name, quantity: item.quantity }));
            await db.collection('kitchenQueue').doc(String(newTicketNumber)).set({
                ticketNumber: newTicketNumber,
                items: kitchenOrderItems,
                orderTimestamp: firebase.firestore.FieldValue.serverTimestamp(),
                status: "pending"
            });

            alert(`会計完了。\n整理番号: ${newTicketNumber}\n合計: ${totalAmount}円\nお預かり: ${amountReceived}円\nお釣り: ${changeGiven}円`);
            cart = []; renderCart();

        } catch (error) {
            console.error("会計処理・Firestore保存エラー: ", error);
            alert("会計処理中にエラーが発生しました。詳細はコンソールを確認してください。");
        }
    });

    // --- 5. 初期化処理 ---
    async function initialize() {
        setupLoginSystem();
        setupServiceButtons();
        setupOperationButtons();
        await fetchProducts();

        // Firestoreのqueue/currentStatusドキュメントがなければ作成
        const doc = await queueStatusRef.get();
        if (!doc.exists) {
            await queueStatusRef.set({
                lastIssuedTicket: 0,
                makingTickets: [],
                readyTickets: [],
                servingTicket: 0,
                waitingCount: 0
            });
        }
    }
    
    initialize();
});