// js/pos-script.js (最終完成版 - 省略なし)

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. 要素の取得 ---
    const registerClosedOverlay = document.getElementById('register-closed-overlay');
    const openRegisterBtnOverlay = document.getElementById('open-register-btn-overlay'); // ★この行を追加
    const footerDepositBtn = document.getElementById('footer-deposit-btn');
    const loginModal = document.getElementById('login-modal');
    const loginSubmitButton = document.getElementById('login-submit-button');
    const cartItemsTbody = document.getElementById('cart-items-tbody');
    const totalAmountSpan = document.getElementById('total-amount');
    const productListDiv = document.getElementById('product-list');
    const serviceListDiv = document.getElementById('service-list');
    const operationListDiv = document.getElementById('operation-list');
    const logoutButton = document.getElementById('footer-logout-btn');
    const cancelCartFooterBtn = document.getElementById('footer-cancel-btn');
    const posMainAlert = document.getElementById('pos-main-alert');
    const discountDisplayArea = document.getElementById('discount-display-area');
    const discountAmountDisplay = document.getElementById('discount-amount-display');
    const cancelDiscountBtn = document.getElementById('cancel-discount-btn');
    const salesStatsModal = document.getElementById('sales-stats-modal');
    const discountModal = document.getElementById('discount-modal');
    const donationModal = document.getElementById('donation-modal');
    const cashCheckModal = document.getElementById('cash-check-modal');
    const alertListModal = document.getElementById('alert-list-modal');
    const alertListUl = document.getElementById('alert-list-ul');
    const paymentConfirmModal = document.getElementById('payment-confirm-modal');
    const modalTotalAmountSpan = document.getElementById('modal-total-amount');
    const modalAmountReceivedInput = document.getElementById('modal-amount-received');
    const keypadContainer = document.getElementById('keypad-container');
    const modalChangeDisplayP = document.getElementById('modal-change-display');
    const confirmPaymentButton = document.getElementById('confirm-payment-button');
    const cancelPaymentButton = document.getElementById('cancel-payment-button');
    const cashlessPaymentModal = document.getElementById('cashless-payment-modal');
    const cashlessModalTotalAmount = document.getElementById('cashless-modal-total-amount');
    const cashlessModalFee = document.getElementById('cashless-modal-fee');
    const cashlessModalNetAmount = document.getElementById('cashless-modal-net-amount');
    const cashlessChargeAmount = document.getElementById('cashless-charge-amount');
    const confirmCashlessPaymentButton = document.getElementById('confirm-cashless-payment-button');
    const cancelCashlessPaymentButton = document.getElementById('cancel-cashless-payment-button');

    // --- 2. グローバル変数 ---
    let cart = [], products = [], currentDiscount = { type: null, amount: 0 }, alerts = {}, cashInDrawer = {};
    let registerStatus = 'closed';
    const db = firebase.firestore();
    const queueStatusRef = db.collection('queue').doc('currentStatus');
    const registerStatusRef = db.collection('setting').doc('registerStatus');
    let salesChartInstance = null;
    const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzL1jJIgu5pOQEH_h0rJOjuEfytYq9xW8KGUjyI612xrhq8EbwSeIdWX0dw86UiIQCe/exec';
    const FEE_RATES = { credit_card: 0.0250, e_money: 0.0325, qr_code: 0.0325, ic_card: 0.0325 };

    // --- 3. 初期化処理 ---
    async function initialize() {
        document.querySelectorAll('.modal .close-modal-button').forEach(btn => {
            setupLoginSystem();
            btn.addEventListener('click', () => btn.closest('.modal').classList.add('hidden'));
        });
        const statusDoc = await registerStatusRef.get();
        if (statusDoc.exists && statusDoc.data().status === 'open') {
            registerStatus = 'open';
            cashInDrawer = statusDoc.data().closingCashCounts || {};
        } else {
            registerStatus = 'closed';
            registerClosedOverlay.classList.remove('hidden');
        }
        setupEventListeners();
        setupOperationButtons();
        setupServiceButtons();
        fetchProducts();
        initializeCashManagement();
    }

    // --- 4. イベントリスナー設定 ---
    function setupEventListeners() {
        document.querySelectorAll('.checkout-btn.new').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const method = e.currentTarget.dataset.method;
                if (cart.length === 0 && currentDiscount.amount === 0) {
                    alert("カートが空です。");
                    return;
                }
                if (method === 'cash') {
                    openPaymentModal();
                } else {
                    openCashlessPaymentModal(method);
                }
            });
        });
        footerDepositBtn?.addEventListener('click', () => {
            if (registerStatus === 'closed') {
                alert('レジが開いていません。');
                return;
            }
            openCashCheckModal('deposit');
        });
        cancelCartFooterBtn?.addEventListener('click', () => {
            if (cart.length > 0 || currentDiscount.amount > 0) {
                if (confirm('カートの内容をすべて取り消しますか？')) clearCart();
            }
        });
        logoutButton?.addEventListener('click', () => {
            if (confirm('ログアウトしますか？')) {
                clearCart();
                loginModal?.classList.remove('hidden');
            }
        });
        document.getElementById('footer-alert-btn')?.addEventListener('click', openAlertListModal);
        cancelDiscountBtn?.addEventListener('click', clearDiscount);
        document.getElementById('apply-discount-btn')?.addEventListener('click', applyDiscount);
        document.getElementById('confirm-donation-btn')?.addEventListener('click', confirmDonation);
        confirmPaymentButton?.addEventListener('click', () => confirmPayment('cash'));
        cancelPaymentButton?.addEventListener('click', () => paymentConfirmModal.classList.add('hidden'));
        confirmCashlessPaymentButton?.addEventListener('click', (e) => confirmPayment(e.currentTarget.dataset.method));
        cancelCashlessPaymentButton?.addEventListener('click', () => cashlessPaymentModal.classList.add('hidden'));
        
        // ★★★ オーバーレイ内のレジ開けボタンにイベントを設定 ★★★
        openRegisterBtnOverlay?.addEventListener('click', openRegister);
    }

    // --- 5. 各機能の関数定義 ---

    // ログインとアラート
    function setupLoginSystem() {
        const employeeIdInput = document.getElementById('employee-id-input');
        const loginSubmitBtn = document.getElementById('login-submit-button');
        if (!loginModal || !loginSubmitBtn || !employeeIdInput) return;
        loginModal.classList.remove('hidden');
        loginSubmitBtn.addEventListener('click', async () => {
            const inputId = employeeIdInput.value.trim();
            if (inputId === '') { alert('学籍番号を入力してください。'); return; }
            try {
                const querySnapshot = await db.collection('employees').where('studentId', '==', inputId).get();
                if (querySnapshot.empty) {
                    alert('この学籍番号は登録されていません。');
                    employeeIdInput.value = '';
                } else {
                    loginModal.classList.add('hidden');
                }
            } catch (error) { console.error("ログイン認証エラー: ", error); alert("ログイン処理中にエラーが発生しました。"); }
        });
    }

    async function initializeCashManagement() {
        if(registerStatus === 'closed') return;
        setInterval(() => addAlert('cash_check', 'レジ点検を行ってください'), 1000 * 60 * 60);
        const configDoc = await db.collection('setting').doc('cashConfig').get();
        if (configDoc.exists) {
            const config = configDoc.data();
            if(Object.keys(cashInDrawer).length === 0) initializeCashInDrawer(config);
            checkCashLevels(config);
        }
    }
    
    function initializeCashInDrawer(config) {
        if (config && config.initialCounts) {
            cashInDrawer = { ...config.initialCounts };
        } else if (config && config.denominations) {
            Object.keys(config.denominations).forEach(value => { cashInDrawer[value] = 0; });
        }
    }

    function addAlert(id, message) { alerts[id] = message; updateAlertsView(); }
    function removeAlert(id) { delete alerts[id]; updateAlertsView(); }
    function updateAlertsView() {
        const alertCount = Object.keys(alerts).length;
        alertListUl.innerHTML = alertCount > 0 ? Object.values(alerts).map(msg => `<li>${msg}</li>`).join('') : '<li>現在、アラートはありません。</li>';
        const alertBadge = document.querySelector('#footer-alert-btn .alert-badge');
        if (alertBadge) {
            if (alertCount > 0) {
                posMainAlert.textContent = '業務アラートが発生しています。確認してください。';
                posMainAlert.classList.add('active-alert');
                alertBadge.textContent = alertCount;
                alertBadge.classList.remove('hidden');
            } else {
                posMainAlert.textContent = '商品を登録してください。よろしければ、会計してください。';
                posMainAlert.classList.remove('active-alert');
                alertBadge.classList.add('hidden');
            }
        }
    }
    function openAlertListModal() { alertListModal.classList.remove('hidden'); }

    // カートと会計
    async function fetchProducts() {
        try {
            const snapshot = await db.collection('products').orderBy('order', 'asc').get();
            products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderProducts();
        } catch (error) { console.error("商品データの読み込みエラー: ", error); }
    }
    function renderProducts() {
        if (!productListDiv) return;
        productListDiv.innerHTML = '';
        products.forEach(product => {
            const button = document.createElement('button');
            button.textContent = product.name;
            button.addEventListener('click', () => addToCart(product));
            productListDiv.appendChild(button);
        });
    }
    function addToCart(product) {
        const existingItem = cart.find(item => item.id === product.id);
        if (existingItem) existingItem.quantity++;
        else cart.push({ ...product, quantity: 1 });
        renderCart();
        updateCustomerDisplay();
    }
    function removeFromCart(productId) {
        const itemIndex = cart.findIndex(item => item.id === productId);
        if (itemIndex > -1) {
            if (cart[itemIndex].quantity > 1) cart[itemIndex].quantity--;
            else cart.splice(itemIndex, 1);
        }
        renderCart();
        updateCustomerDisplay();
    }
    function renderCart() {
        if (!cartItemsTbody || !totalAmountSpan) return;
        cartItemsTbody.innerHTML = '';
        let subTotal = 0;
        if (cart.length > 0) {
            const headerRow = cartItemsTbody.insertRow();
            headerRow.className = 'table-header';
            headerRow.innerHTML = `<td>取消</td><td>商品名</td><td style="text-align: right;">単価</td><td style="text-align: right;">数量</td><td style="text-align: right;">金額</td>`;
        }
        cart.forEach(item => {
            const row = cartItemsTbody.insertRow();
            const itemSubTotal = item.price * item.quantity;
            subTotal += itemSubTotal;
            const removeButtonHTML = `<button class="remove-item-btn" data-item-id="${item.id}">-</button>`;
            row.innerHTML = `<td>${removeButtonHTML}</td><td>${item.name}</td><td style="text-align: right;">${item.price}</td><td style="text-align: right;">${item.quantity}</td><td style="text-align: right;">${itemSubTotal}</td>`;
        });
        cartItemsTbody.querySelectorAll('.remove-item-btn').forEach(btn => btn.addEventListener('click', e => removeFromCart(e.target.dataset.itemId)));
        const total = subTotal - currentDiscount.amount;
        totalAmountSpan.textContent = total > 0 ? total : 0;
    }
    function clearCart() {
        cart = [];
        clearDiscount();
        renderCart();
        updateCustomerDisplay('menu');
    }
    function openPaymentModal() {
        updateCustomerDisplay('cash');
        const total = parseFloat(totalAmountSpan.textContent) || 0;
        modalTotalAmountSpan.textContent = total;
        modalAmountReceivedInput.value = total;
        generateKeypad();
        calculateModalChange();
        paymentConfirmModal.classList.remove('hidden');
    }
    function openCashlessPaymentModal(method) {
        updateCustomerDisplay(method);
        const total = parseFloat(totalAmountSpan.textContent) || 0;
        const feeRate = FEE_RATES[method] || 0;
        const fee = Math.round(total * feeRate);
        const netAmount = total - fee;
        cashlessModalTotalAmount.textContent = total;
        cashlessChargeAmount.textContent = total;
        cashlessModalFee.textContent = fee;
        cashlessModalNetAmount.textContent = netAmount;
        confirmCashlessPaymentButton.dataset.method = method;
        cashlessPaymentModal.classList.remove('hidden');
    }
    async function confirmPayment(paymentMethod) {
        let totalAmount, amountReceived, changeGiven, fee = 0;
        if (paymentMethod === 'cash') {
            totalAmount = parseFloat(modalTotalAmountSpan.textContent) || 0;
            amountReceived = parseFloat(modalAmountReceivedInput.value) || 0;
            if (amountReceived < totalAmount) { alert("お預かり金額が不足しています。"); return; }
            changeGiven = amountReceived - totalAmount;
        } else {
            totalAmount = parseFloat(cashlessModalTotalAmount.textContent) || 0;
            amountReceived = totalAmount;
            changeGiven = 0;
            fee = Math.round(totalAmount * (FEE_RATES[paymentMethod] || 0));
        }
        try {
            const newTicketNumber = await db.runTransaction(async (transaction) => {
                const queueDoc = await transaction.get(queueStatusRef);
                const lastIssuedTicket = queueDoc.exists ? (queueDoc.data().lastIssuedTicket || 0) : 0;
                const newTicket = lastIssuedTicket + 1;
                const updateData = { lastIssuedTicket: newTicket, makingTickets: firebase.firestore.FieldValue.arrayUnion(newTicket), waitingCount: firebase.firestore.FieldValue.increment(1) };
                if (!queueDoc.exists) transaction.set(queueStatusRef, { ...updateData, readyTickets: [], servingTicket: 0 });
                else transaction.update(queueStatusRef, updateData);
                return newTicket;
            });
            await db.collection('sales').add({ timestamp: firebase.firestore.FieldValue.serverTimestamp(), items: cart, totalAmount, amountReceived, changeGiven, paymentMethod, ticketNumber: newTicketNumber, status: "completed", discount: currentDiscount });
            const kitchenOrderItems = cart.map(item => ({ name: item.name, quantity: item.quantity }));
            if (kitchenOrderItems.length > 0) await db.collection('kitchenQueue').doc(String(newTicketNumber)).set({ ticketNumber: newTicketNumber, items: kitchenOrderItems, orderTimestamp: firebase.firestore.FieldValue.serverTimestamp(), status: "pending" });
            
            const logData = { paymentMethod, totalAmount, fee, discountAmount: currentDiscount.amount, items: cart };
            await fetch(GAS_WEB_APP_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(logData) });
            
            // ★★★★★★★★★★★★★★★★★★★★★★★
            //      ここからがレシート発行処理
            // ★★★★★★★★★★★★★★★★★★★★★★★

            // 1. 印刷用のデータオブジェクトを作成
            const now = new Date();
            const timestamp = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            
            const receiptData = {
                timestamp,
                ticketNumber: newTicketNumber,
                items: cart.map(item => ({ name: item.name, price: item.price, quantity: item.quantity })),
                totalAmount,
                discountAmount: currentDiscount.amount,
                paymentMethod: paymentMethod.replace('_', ' ').toUpperCase() // "credit_card" -> "CREDIT CARD"
            };
            
            // 2. URLパラメータとしてデータをエンコード
            const encodedData = encodeURIComponent(JSON.stringify(receiptData));
            const printUrl = `receipt.html?data=${encodedData}`;
            
            // 3. 新しいウィンドウで印刷ページを開く
            window.open(printUrl, '_blank', 'width=100,height=100,top=0,left=0');

            // ★★★★★★★★★★★★★★★★★★★★★★★
            //      レシート発行処理はここまで
            // ★★★★★★★★★★★★★★★★★★★★★★★

            if (paymentMethod === 'cash') {
                updateCashInDrawer(amountReceived, changeGiven);
                const configDoc = await db.collection('setting').doc('cashConfig').get();
                if (configDoc.exists) checkCashLevels(configDoc.data());
            }

            alert(`会計完了。\n整理番号: ${newTicketNumber}`);
            clearCart();
            paymentConfirmModal.classList.add('hidden');
            cashlessPaymentModal.classList.add('hidden');
        } catch (error) { console.error("会計処理エラー: ", error); alert("会計処理中にエラーが発生しました。"); }
    }

    async function updateCustomerDisplay(paymentStatus = 'menu') {
        const total = parseFloat(totalAmountSpan.textContent) || 0;
        const items = cart.map(item => ({ name: item.name, quantity: item.quantity, subtotal: item.price * item.quantity }));
        try {
            await db.collection('customerDisplay').doc('currentCart').set({ items, total, paymentStatus });
        } catch (error) { console.error("お会計表示画面へのデータ送信エラー:", error); }
    }

    function generateKeypad() {
        if (!keypadContainer) return;
        keypadContainer.innerHTML = '';
        const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', 'BS'];
        keys.forEach(key => {
            const button = document.createElement('button');
            button.textContent = key;
            button.addEventListener('click', () => {
                const currentVal = modalAmountReceivedInput.value;
                if (key === 'C') { modalAmountReceivedInput.value = '0'; }
                else if (key === 'BS') { modalAmountReceivedInput.value = currentVal.length > 1 ? currentVal.slice(0, -1) : '0'; }
                else { modalAmountReceivedInput.value = currentVal === '0' ? key : currentVal + key; }
                calculateModalChange();
            });
            keypadContainer.appendChild(button);
        });
    }
    
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

    // 業務タブとレジ管理
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
    /**
     * 業務タブのボタンを描画する（修正版）
     */
    function setupOperationButtons() {
        if (!operationListDiv) return;
        operationListDiv.innerHTML = ''; // 中身を一旦空にする

        let buttonsToShow = [];

        if (registerStatus === 'closed') {
            // ■■■ レジ締め中に表示するボタン ■■■
            buttonsToShow = [
                { name: 'レジ開け', action: openRegister },
            ];
        } else {
            // ■■■ 営業中に表示するボタン ■■■
            buttonsToShow = [
                { name: 'レジ締め', action: closeRegister },
                { name: '作成指示画面', action: () => window.open('kitchen-prep.html', '_blank') },
                { name: '作成管理画面', action: () => window.open('kitchen-complete.html', '_blank') },
                { name: '呼出画面', action: () => window.open('queue-display.html', '_blank') },
                { name: '会計画面', action: () => window.open('customer-display.html', '_blank') },
                { name: '呼出管理', action: openServingControlModal },
                { name: '販売数確認', action: openSalesStatsModal },
                { name: '値引き', action: () => discountModal.classList.remove('hidden') },
                { name: 'レジ点検', action: () => openCashCheckModal('check') },
            ];
        }

        // 決定したボタンリストを描画
        buttonsToShow.forEach(item => {
            const button = document.createElement('button');
            button.textContent = item.name;
            button.addEventListener('click', item.action);
            operationListDiv.appendChild(button);
        });
    }
    
    async function openSalesStatsModal() {
        salesStatsModal.classList.remove('hidden');
        const listEl = document.getElementById('sales-by-item-list');
        listEl.innerHTML = '<p>データを集計中...</p>';
        try {
            const salesSnapshot = await db.collection('sales').get();
            const sales = salesSnapshot.docs.map(doc => doc.data());
            const itemCounts = {};
            sales.forEach(sale => { if (sale.items && Array.isArray(sale.items)) { sale.items.forEach(item => { itemCounts[item.name] = (itemCounts[item.name] || 0) + item.quantity; }); } });
            listEl.innerHTML = '<h5>商品別販売数</h5><ul>' + Object.entries(itemCounts).map(([name, count]) => `<li><span>${name}</span><span>${count}個</span></li>`).join('') + '</ul>';
            const hourlySales = Array(8).fill(0);
            sales.forEach(sale => { if (sale.timestamp && sale.timestamp.toDate) { const hour = sale.timestamp.toDate().getHours(); hourlySales[Math.floor(hour / 3)] += sale.totalAmount; } });
            if (salesChartInstance) salesChartInstance.destroy();
            const ctx = document.getElementById('sales-chart').getContext('2d');
            salesChartInstance = new Chart(ctx, { type: 'bar', data: { labels: ['0-3', '3-6', '6-9', '9-12', '12-15', '15-18', '18-21', '21-24'], datasets: [{ label: '3時間ごとの売上 (円)', data: hourlySales, backgroundColor: 'rgba(0, 160, 233, 0.6)' }] }, options: { responsive: true, maintainAspectRatio: false } });
        } catch (error) { console.error("販売数データ取得エラー:", error); listEl.innerHTML = '<p style="color:red;">データ取得に失敗しました。</p>'; }
    }
    function applyDiscount() {
        const amountInput = document.getElementById('discount-amount-input');
        const amount = parseInt(amountInput.value);
        if (isNaN(amount) || amount <= 0) { alert('正しい金額を入力してください。'); return; }
        currentDiscount = { type: 'manual', amount };
        discountAmountDisplay.textContent = `- ¥${amount}`;
        discountDisplayArea.classList.remove('hidden');
        discountModal.classList.add('hidden');
        amountInput.value = '';
        renderCart();
    }
    function clearDiscount() {
        currentDiscount = { type: null, amount: 0 };
        discountDisplayArea.classList.add('hidden');
        renderCart();
    }
    async function confirmDonation() {
        const nameInput = document.getElementById('donator-name-input');
        const amountInput = document.getElementById('donation-amount-input');
        const name = nameInput.value;
        const amount = parseInt(amountInput.value);
        if (name.trim() === '' || isNaN(amount) || amount <= 0) { alert('全ての項目を正しく入力してください。'); return; }
        try {
            await db.collection('donations').add({ name, amount, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
            alert(`${name}様より、${amount}円の寄付を登録しました。`);
            donationModal.classList.add('hidden');
            nameInput.value = '';
            amountInput.value = '';
        } catch (error) { console.error('寄付情報の保存エラー:', error); alert('登録に失敗しました。'); }
    }
    /**
     * レジ開け処理
     */
    async function openRegister() {
        if (!confirm('レジ開け処理を開始しますか？')) return;
        
        // ★★★★★ ここからが修正箇所 ★★★★★

        // 先にオーバーレイを非表示にする
        registerClosedOverlay.classList.add('hidden');

        const statusDoc = await registerStatusRef.get();
        // 前回の締めデータが存在し、かつ空でない場合
        if (statusDoc.exists && statusDoc.data().closingCashCounts && Object.keys(statusDoc.data().closingCashCounts).length > 0) {
            cashInDrawer = { ...statusDoc.data().closingCashCounts };
            alert('前回のレジ締め時点の釣銭準備金で営業を開始します。');
            await finalizeOpening(); // レジ開け完了処理へ
        } else {
            // 初回起動時 or データがない場合、手入力させる
            alert('初回レジ開けのため、釣銭準備金の初期枚数を入力してください。');
            openCashCheckModal('initial_setup'); // 釣銭入力モーダルを開く
        }
        // ★★★★★ ここまでが修正箇所 ★★★★★
    }

    /**
     * 最終的なレジ開け完了処理
     */
    async function finalizeOpening() {
        // 先にFirestoreの状態を更新
        await registerStatusRef.update({ 
            status: 'open',
        });
        
        // グローバル変数を更新
        registerStatus = 'open';
        
        // オーバーレイを閉じる
        registerClosedOverlay.classList.add('hidden');
        
        // ★★★★★ 最も重要な修正 ★★★★★
        // 全ての状態が'open'に確定したこのタイミングで、ボタンを再描画する
        setupOperationButtons(); 
        
        // その他の初期化処理を開始
        initializeCashManagement(); 
        const configDoc = await db.collection('setting').doc('cashConfig').get();
        if(configDoc.exists) {
            checkCashLevels(configDoc.data());
        }
    }

    async function closeRegister() {
        try {
            const statusDoc = await registerStatusRef.get();
            const lastCheck = statusDoc.data().lastCheckTimestamp.toDate();
            const now = new Date();
            const diffMinutes = (now - lastCheck) / (1000 * 60);
            if (diffMinutes > 30) {
                alert('最終レジ点検から30分以上経過しています。最終点検を行ってください。');
                openCashCheckModal('final_check');
            } else {
                if (confirm('レジ締め処理を実行しますか？')) await finalizeClosing();
            }
        } catch (error) {
            console.error("レジ締め処理中のエラー:", error);
            alert("最終点検が記録されていません。レジ締めのために最終点検を行ってください。");
            openCashCheckModal('final_check');
        }
    }
    /**
     * 最終的な締め処理
     */
    async function finalizeClosing() {
        try {
            await registerStatusRef.update({ 
                status: 'closed',
                closingCashCounts: cashInDrawer // 現在のレジ内現金を翌日の準備金として保存
            });
            registerStatus = 'closed';
            registerClosedOverlay.classList.remove('hidden');
            alert('レジ締めが完了しました。');
            
            // ★★★★★ この一行を追加 ★★★★★
            setupOperationButtons(); // 業務タブのボタンを再描画する

        } catch (error) {
            console.error("レジ締め処理の最終化でエラー:", error);
            alert("レジ締め処理に失敗しました。");
        }
    }
    async function openCashCheckModal(mode) {
        cashCheckModal.classList.remove('hidden');
        const modalTitle = cashCheckModal.querySelector('h4');
        const completeButton = document.getElementById('complete-cash-check-btn');
        const contentEl = document.getElementById('cash-check-content');
        const theoreticalBalanceEl = document.getElementById('theoretical-balance');
        const actualBalanceEl = document.getElementById('actual-balance');
        const differenceEl = document.getElementById('balance-difference');
        
        actualBalanceEl.textContent = '0';
        differenceEl.textContent = '0';
        differenceEl.parentElement.classList.remove('plus', 'minus');

        switch(mode) {
            case 'initial_setup': modalTitle.textContent = '初期釣銭準備金入力'; completeButton.textContent = '営業を開始する'; theoreticalBalanceEl.textContent = '---'; break;
            case 'deposit': modalTitle.textContent = '手入力入金 (釣銭追加)'; completeButton.textContent = '追加枚数を登録する'; theoreticalBalanceEl.textContent = '---'; break;
            case 'check': modalTitle.textContent = 'レジ点検'; completeButton.textContent = '点検完了'; break;
            case 'final_check': modalTitle.textContent = '最終レジ点検 (レジ締め)'; completeButton.textContent = '最終点検を完了しレジを締める'; break;
        }

        let theoreticalBalance = 0;
        if (mode === 'check' || mode === 'final_check') {
            theoreticalBalanceEl.textContent = '計算中...';
            const [configDoc, salesSnapshot, donationsSnapshot] = await Promise.all([ db.collection('setting').doc('cashConfig').get(), db.collection('sales').get(), db.collection('donations').get() ]);
            if(configDoc.exists){
                const cashConfig = configDoc.data();
                const initialAmount = cashConfig.initialAmount || 0;
                const totalCashSales = salesSnapshot.docs.reduce((sum, doc) => sum + (doc.data().paymentMethod === 'cash' ? doc.data().amountReceived - doc.data().changeGiven : 0), 0);
                const totalDonations = donationsSnapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
                theoreticalBalance = initialAmount + totalCashSales + totalDonations;
                theoreticalBalanceEl.textContent = theoreticalBalance;
            }
        }
        
        const configDoc = await db.collection('setting').doc('cashConfig').get();
        if (!configDoc.exists) { contentEl.innerHTML = '<p style="color:red;">釣銭設定なし</p>'; return; }
        const denominations = configDoc.data().denominations;
        contentEl.innerHTML = '';
        Object.entries(denominations).sort((a,b)=>b[0]-a[0]).forEach(([value,name])=>{
            const currentCount = (mode === 'initial_setup' || mode === 'deposit') ? '' : (cashInDrawer[value] || 0);
            contentEl.innerHTML += `<div class="modal-input-group"><label>${name}:</label><input type="number" class="cash-count" data-value="${value}" value="${currentCount}" placeholder="枚数"><span>枚</span></div>`;
        });
        
        contentEl.querySelectorAll('.cash-count').forEach(input => input.addEventListener('input', () => calculateActualBalance(theoreticalBalance)));
        calculateActualBalance(theoreticalBalance);
        
        completeButton.onclick = async () => {
        // ★★★★★ ここからが修正箇所 ★★★★★
            
            // 先にモーダルに入力された枚数でグローバル変数cashInDrawerを更新
            updateCashInDrawerFromModal(mode); 
            cashCheckModal.classList.add('hidden'); // 先にモーダルを閉じる

            if (mode === 'initial_setup') {
                alert('釣銭準備金を登録しました。');
                
                // ★★★ 初回設定時、入力された枚数をclosingCashCountsにも保存する ★★★
                await registerStatusRef.update({
                    closingCashCounts: cashInDrawer 
                });

                // その後、レジ開け完了処理へ
                await finalizeOpening(); 

            } else if (mode === 'deposit') {
                alert('釣銭の追加を記録しました。');
            } else {
                const difference = parseInt(document.getElementById('balance-difference').textContent) || 0;
                await registerStatusRef.update({ lastCheckTimestamp: new Date() });
                removeAlert('cash_check');
                if (difference !== 0) addAlert('cash_check_difference', `${Math.abs(difference)}円の差額があります。`);
                else removeAlert('cash_check_difference');
                alert('レジ点検を完了しました。');
                if (mode === 'final_check') if(confirm('最終点検が完了しました。レジを締めますか？')) await finalizeClosing();
            }
        };
    }
    
    /**
     * モーダルに入力された枚数でレジ内現金を更新する
     * @param {string} mode - 'deposit', 'initial_setup', 'check', 'final_check'
     */
    function updateCashInDrawerFromModal(mode) {
        document.querySelectorAll('#cash-check-content .cash-count').forEach(input => {
            const value = input.dataset.value;
            const count = parseInt(input.value) || 0;
            
            if (mode === 'deposit') {
                // 'deposit'モードでは加算する
                cashInDrawer[value] = (cashInDrawer[value] || 0) + count;
            } else {
                // 'initial_setup', 'check', 'final_check'モードでは入力された値で上書きする
                cashInDrawer[value] = count;
            }
        });
        console.log("モーダル入力によりレジ内現金を更新:", cashInDrawer);

        // 更新後に釣銭レベルを再チェック
        db.collection('setting').doc('cashConfig').get().then(doc => {
            if(doc.exists) {
                checkCashLevels(doc.data());
            }
        });
    }
    
    function calculateActualBalance(theoreticalBalance) {
        let actualTotal = 0;
        document.querySelectorAll('#cash-check-content .cash-count').forEach(input => {
            const value = parseInt(input.dataset.value);
            const count = parseInt(input.value) || 0;
            actualTotal += value * count;
        });
        const actualBalanceEl = document.getElementById('actual-balance');
        const differenceEl = document.getElementById('balance-difference');
        const differenceSpan = differenceEl.parentElement;
        actualBalanceEl.textContent = actualTotal;
        const difference = actualTotal - theoreticalBalance;
        differenceEl.textContent = difference;
        differenceSpan.classList.remove('plus', 'minus');
        if (difference > 0) differenceSpan.classList.add('plus');
        else if (difference < 0) differenceSpan.classList.add('minus');
    }
    
    function checkCashLevels(config) {
        if (!config || !config.thresholds || !config.denominations) return;
        const { thresholds, denominations } = config;
        Object.keys(thresholds).forEach(value => {
            const thresholdCount = thresholds[value];
            const currentCount = cashInDrawer[value] || 0;
            const alertId = `cash_level_${value}`;
            const coinName = denominations[value] || `${value}円`;
            if (currentCount <= thresholdCount) addAlert(alertId, `釣銭が不足しています: ${coinName}`);
            else removeAlert(alertId);
        });
    }
    
    /**
     * レジ内の現金枚数を更新する（高精度版）
     * @param {number} amountReceived - 顧客から預かった金額
     * @param {number} changeAmount - 顧客へ渡したお釣り
     */
    function updateCashInDrawer(amountReceived, changeAmount) {
        console.log(`レジ内現金を更新します。お預かり: ${amountReceived}円, お釣り: ${changeAmount}円`);

        // 金種を大きい順に定義
        const denominations = [10000, 5000, 1000, 500, 100, 50, 10, 5, 1];

        // --- 1. お預かりした現金をレジに加える ---
        let remainingReceived = amountReceived;
        denominations.forEach(value => {
            const valueStr = String(value);
            if (remainingReceived >= value) {
                // この金種が何枚入ってきたかを計算
                const count = Math.floor(remainingReceived / value);
                if (cashInDrawer[valueStr] !== undefined) {
                    cashInDrawer[valueStr] += count;
                }
                // 残りの金額を更新
                remainingReceived %= value;
            }
        });

        // --- 2. お釣りとして支払った現金をレジから引く ---
        let remainingChange = changeAmount;
        denominations.forEach(value => {
            const valueStr = String(value);
            if (remainingChange >= value) {
                if (cashInDrawer[valueStr] !== undefined) {
                    // この金種を何枚お釣りとして使うかを計算
                    // (レジにある枚数と、必要枚数のうち少ない方)
                    const countToUse = Math.min(cashInDrawer[valueStr], Math.floor(remainingChange / value));
                    
                    cashInDrawer[valueStr] -= countToUse;
                    // 残りのお釣り金額を更新
                    remainingChange -= countToUse * value;
                }
            }
        });

        // お釣りが支払い切れなかった場合（釣銭不足）の警告
        if (remainingChange > 0) {
            console.warn(`釣銭不足: ${remainingChange}円分のお釣りが不足しています。`);
            // 必要に応じてアラートを出すことも可能
            // addAlert('cash_shortage', `釣銭不足が発生しました: ${remainingChange}円`);
        }

        console.log("更新後のレジ内現金:", cashInDrawer);
    }
    
    /**
     * 呼出・お渡し管理モーダルを開く
     */
    function openServingControlModal() {
        const modal = document.getElementById('serving-control-modal');
        const makingList = document.getElementById('serving-making-list');
        const readyList = document.getElementById('serving-ready-list');

        db.collection('queue').doc('currentStatus').onSnapshot(doc => {
            if (!doc.exists) return;
            const data = doc.data();
            
            makingList.innerHTML = '';
            (data.makingTickets || []).sort((a,b)=>a-b).forEach(ticket => {
                const li = document.createElement('li');
                li.textContent = `No. ${ticket} (調理完了にする)`;
                li.onclick = () => moveTicketToReady(ticket);
                makingList.appendChild(li);
            });

            readyList.innerHTML = '';
            (data.readyTickets || []).sort((a,b)=>a-b).forEach(ticket => {
                const li = document.createElement('li');
                li.textContent = `No. ${ticket} (お渡し完了にする)`;
                li.onclick = () => completeServing(ticket);
                readyList.appendChild(li);
            });
        });
        modal.classList.remove('hidden');
    }
    /**
     * チケットを「調理完了待ち」から「お渡し可能」へ移動する
     * @param {number} ticketNumber 
     */
    async function moveTicketToReady(ticketNumber) {
        if (!confirm(`整理番号 ${ticketNumber} を調理完了にし、「お渡し可能」に移動しますか？`)) return;
        try {
            await db.runTransaction(async (transaction) => {
                const queueDoc = await transaction.get(queueStatusRef);
                if (!queueDoc.exists) throw "キューの状態ドキュメントが見つかりません。";
                transaction.update(queueStatusRef, {
                    makingTickets: firebase.firestore.FieldValue.arrayRemove(ticketNumber),
                    readyTickets: firebase.firestore.FieldValue.arrayUnion(ticketNumber)
                });
            });
            // 厨房キューからも削除
            await db.collection('kitchenQueue').doc(String(ticketNumber)).delete();
        } catch (error) {
            console.error("調理完了への移動処理エラー:", error);
            alert("処理に失敗しました。");
        }
    }
    /**
     * チケットの「お渡し」を完了し、リストから削除する
     * @param {number} ticketNumber 
     */
    async function completeServing(ticketNumber) {
        if (!confirm(`整理番号 ${ticketNumber} のお渡しを完了しますか？`)) return;
        try {
            await db.runTransaction(async (transaction) => {
                const queueDoc = await transaction.get(queueStatusRef);
                if (!queueDoc.exists) throw "キューの状態ドキュメントが見つかりません。";
                const currentWaitingCount = queueDoc.data().waitingCount || 0;
                transaction.update(queueStatusRef, {
                    readyTickets: firebase.firestore.FieldValue.arrayRemove(ticketNumber),
                    waitingCount: currentWaitingCount > 0 ? firebase.firestore.FieldValue.increment(-1) : 0
                });
            });
        } catch (error) {
            console.error("お渡し完了処理エラー:", error);
            alert("処理に失敗しました。");
        }
    }

    // --- 初期化処理の実行 ---
    initialize();
});