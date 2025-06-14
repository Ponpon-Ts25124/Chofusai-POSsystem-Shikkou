// js/pos-script.js (完全版)

document.addEventListener('DOMContentLoaded', () => {
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
    const posMainAlert = document.getElementById('pos-main-alert');
    const discountDisplayArea = document.getElementById('discount-display-area');
    const discountAmountDisplay = document.getElementById('discount-amount-display');
    const cancelDiscountBtn = document.getElementById('cancel-discount-btn');
    // モーダル関連
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
    const paymentMethodModal = document.getElementById('payment-method-modal');
    const cancelMethodSelectionBtn = document.getElementById('cancel-method-selection');

    // キャッシュレス決済モーダル関連
    const cashlessPaymentModal = document.getElementById('cashless-payment-modal');
    const checkoutOtherBtn = document.getElementById('checkout-other-btn');
    const cashlessModalTotalAmount = document.getElementById('cashless-modal-total-amount');
    const cashlessModalFee = document.getElementById('cashless-modal-fee');
    const cashlessModalNetAmount = document.getElementById('cashless-modal-net-amount');
    const cashlessChargeAmount = document.getElementById('cashless-charge-amount');
    const confirmCashlessPaymentButton = document.getElementById('confirm-cashless-payment-button');
    const cancelCashlessPaymentButton = document.getElementById('cancel-cashless-payment-button');

    // --- 2. グローバル変数 ---
    let cart = []; 
    let products = [];
    let currentDiscount = { type: null, amount: 0 };
    let alerts = {};
    let cashInDrawer = {}; // ★★★ この行を追加 ★★★
    const db = firebase.firestore();
    const queueStatusRef = db.collection('queue').doc('currentStatus');
    let salesChartInstance = null;
    const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzL1jJIgu5pOQEH_h0rJOjuEfytYq9xW8KGUjyI612xrhq8EbwSeIdWX0dw86UiIQCe/exec'; // ★★★★★ 必ず設定 ★★★★★

    // ★★★ 決済手数料率を定義 ★★★
    // ※※※ ここの値を、実際の正しい手数料率に書き換えてください ※※※
    const FEE_RATES = {
        credit_card: 0.0250, // 例: 2.50%
        e_money: 0.0325,     // 例: 3.25%
        qr_code: 0.0325,      // 例: 3.25%
        ic_card: 0.0325 // 例: 1.50%
    };

    // --- 3. 初期化処理 ---
    function initialize() {
        document.querySelectorAll('.modal .close-modal-button').forEach(btn => {
            btn.addEventListener('click', () => btn.closest('.modal').classList.add('hidden'));
        });
        setupLoginSystem();
        setupEventListeners();
        setupServiceButtons();
        setupOperationButtons();
        fetchProducts();
        initializeCashManagement();
    }

    function setupEventListeners() {
        // 新しい5つの決済ボタンにイベントを設定
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

        // フッターの中止ボタン
        cancelCartFooterBtn?.addEventListener('click', () => {
            if (cart.length > 0 || currentDiscount.amount > 0) {
                if (confirm('カートの内容をすべて取り消しますか？')) clearCart();
            }
        });

        // 値引きのキャンセルボタン
        cancelDiscountBtn?.addEventListener('click', clearDiscount);

        // 各モーダルの汎用的なイベントリスナー
        document.getElementById('footer-alert-btn')?.addEventListener('click', openAlertListModal);
        document.getElementById('apply-discount-btn')?.addEventListener('click', applyDiscount);
        document.getElementById('confirm-donation-btn')?.addEventListener('click', confirmDonation);

        // 会計確定ボタン
        confirmPaymentButton?.addEventListener('click', () => confirmPayment('cash'));
        confirmCashlessPaymentButton?.addEventListener('click', (e) => {
            const method = e.currentTarget.dataset.method;
            confirmPayment(method);
        });

        // 会計キャンセルボタン
        cancelPaymentButton?.addEventListener('click', () => paymentConfirmModal.classList.add('hidden'));
        cancelCashlessPaymentButton?.addEventListener('click', () => cashlessPaymentModal.classList.add('hidden'));
    }

    /**
     * キャッシュレス決済用のモーダルを開く
     * @param {string} method - 'credit_card', 'e_money', 'qr_code'
     */
        // openCashlessPaymentModal関数を置き換え
    function openCashlessPaymentModal(method) {
        if (cart.length === 0 && currentDiscount.amount === 0) {
            alert("カートが空です。");
            return;
        }
        // ★★★ 顧客画面に決済方法を通知 ★★★
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

    /**
     * ログイン・ログアウト処理
     */
    function setupLoginSystem() {
        const employeeIdInput = document.getElementById('employee-id-input');
        const loginSubmitBtn = document.getElementById('login-submit-button');

        if (!loginModal || !loginSubmitBtn || !employeeIdInput) return;

        // 初期状態ではログインモーダルを表示
        loginModal.classList.remove('hidden');

        // ログインボタンがクリックされたときの処理
        loginSubmitBtn.addEventListener('click', async () => {
            const inputId = employeeIdInput.value.trim();
            if (inputId === '') {
                alert('学籍番号を入力してください。');
                return;
            }

            try {
                // Firestoreのemployeesコレクションを検索
                const querySnapshot = await db.collection('employees').where('studentId', '==', inputId).get();

                if (querySnapshot.empty) {
                    // ドキュメントが見つからない場合
                    alert('この学籍番号は登録されていません。');
                    employeeIdInput.value = ''; // 入力欄をクリア
                } else {
                    // ドキュメントが見つかった場合（ログイン成功）
                    console.log(`ログイン成功: ${inputId}`);
                    loginModal.classList.add('hidden'); // モーダルを閉じる
                }

            } catch (error) {
                console.error("ログイン認証エラー: ", error);
                alert("ログイン処理中にエラーが発生しました。");
            }
        });

        // ログアウトボタンの処理
        logoutButton?.addEventListener('click', () => {
            if (confirm('ログアウトしますか？')) {
                clearCart();
                employeeIdInput.value = ''; // 入力欄をクリア
                loginModal.classList.remove('hidden'); // ログインモーダルを再表示
            }
        });
    }

    async function initializeCashManagement() {
        // 1時間ごとにレジ点検アラートを追加
        setInterval(() => addAlert('cash_check', 'レジ点検を行ってください'), 1000 * 60 * 60);

        // Firestoreから釣銭設定を監視
        db.collection('setting').doc('cashConfig').onSnapshot(doc => {
            if (!doc.exists) {
                console.error("釣銭設定(cashConfig)が見つかりません。");
                return;
            }
            const config = doc.data();
            
            // ★★★ 現金枚数の初期化とチェック処理を追加 ★★★
            initializeCashInDrawer(config); // レジ内現金を初期化
            checkCashLevels(config);    // 起動時に一度チェック
        });
    }

    /**
     * レジ内の金種別枚数を初期化する
     * @param {object} config - Firestoreから取得したcashConfigデータ
     */
    function initializeCashInDrawer(config) {
        if (config && config.initialCounts) {
            cashInDrawer = { ...config.initialCounts };
            console.log("レジ内現金枚数を初期化しました:", cashInDrawer);
        } else {
            console.warn("FirestoreにinitialCountsの設定が見つからないため、現金枚数を初期化できません。");
            // 設定がない場合、すべての金種を0で初期化
            if (config && config.denominations) {
                Object.keys(config.denominations).forEach(value => {
                    cashInDrawer[value] = 0;
                });
            }
        }
    }

    function addAlert(id, message) {
        alerts[id] = message;
        updateAlertsView();
    }
    function removeAlert(id) {
        delete alerts[id];
        updateAlertsView();
    }
    function updateAlertsView() {
        const alertCount = Object.keys(alerts).length;
        alertListUl.innerHTML = alertCount > 0 ? Object.values(alerts).map(msg => `<li>${msg}</li>`).join('') : '<li>現在、アラートはありません。</li>';
        const alertBadge = document.querySelector('#footer-alert-btn .alert-badge');
        
        if (alertCount > 0) {
            posMainAlert.textContent = '業務アラートが発生しています。確認してください。';
            posMainAlert.classList.add('active-alert');
            if(alertBadge) {
                alertBadge.textContent = alertCount;
                alertBadge.classList.remove('hidden');
            }
        } else {
            posMainAlert.textContent = '商品を登録してください。よろしければ、会計してください。';
            posMainAlert.classList.remove('active-alert');
            if(alertBadge) {
                alertBadge.classList.add('hidden');
            }
        }
    }
    function openAlertListModal() {
        alertListModal.classList.remove('hidden');
    }

    // --- 5. カートと会計の機能 ---
    async function fetchProducts() {
        try {
            const snapshot = await db.collection('products').orderBy('order', 'asc').get();
            products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderProducts();
        } catch (error) {
            console.error("商品データの読み込みエラー: ", error);
        }
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
    }

    function removeFromCart(productId) {
        const itemIndex = cart.findIndex(item => item.id === productId);
        if (itemIndex > -1) {
            if (cart[itemIndex].quantity > 1) cart[itemIndex].quantity--;
            else cart.splice(itemIndex, 1);
        }
        renderCart();
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
    }


    // openPaymentModal関数を置き換え
    function openPaymentModal() {
        if (cart.length === 0 && currentDiscount.amount === 0) {
            alert("カートが空です。");
            return;
        }
        // ★★★ 顧客画面に決済方法を通知 ★★★
        updateCustomerDisplay('cash');

        const total = parseFloat(totalAmountSpan.textContent) || 0;
        modalTotalAmountSpan.textContent = total;
        modalAmountReceivedInput.value = total;
        generateKeypad();
        calculateModalChange();
        paymentConfirmModal.classList.remove('hidden');
    }

    // ...
    /**
     * 会計を確定し、データをFirestoreに保存する
     * @param {string} paymentMethod - 'cash', 'credit_card', 'e_money', 'qr_code', 'ic_card'
     */// ★★★ 会計確定処理をスプレッドシート連携版に更新 ★★★
    async function confirmPayment(paymentMethod) {
        let totalAmount, amountReceived, changeGiven, fee = 0;

        if (paymentMethod === 'cash') {
            totalAmount = parseFloat(modalTotalAmountSpan.textContent) || 0;
            amountReceived = parseFloat(modalAmountReceivedInput.value) || 0;
            if (amountReceived < totalAmount) { alert("お預かり金額が不足しています。"); return; }
            changeGiven = amountReceived - totalAmount;
        } else { // cashless
            totalAmount = parseFloat(cashlessModalTotalAmount.textContent) || 0;
            amountReceived = totalAmount;
            changeGiven = 0;
            fee = Math.round(totalAmount * (FEE_RATES[paymentMethod] || 0));
        }
    
            // ★★★ 現金会計の場合、レジ内現金を更新 ★★★
        if (paymentMethod === 'cash') {
            updateCashInDrawer(totalAmount, changeGiven);
            
            // 会計後に再度、釣銭レベルをチェック
            db.collection('setting').doc('cashConfig').get().then(doc => {
                if (doc.exists) {
                    checkCashLevels(doc.data());
                }
            });
        }
        
        try {
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

            // ★★★ Firestoreに保存するデータを修正 ★★★
            await db.collection('sales').add({
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                items: cart,
                totalAmount,
                amountReceived,
                changeGiven,
                paymentMethod, // 'cash', 'credit_card', 'e_money', 'qr_code', 'ic_card' のいずれかが入る
                ticketNumber: newTicketNumber,
                status: "completed",
                discount: currentDiscount
            });

            const kitchenOrderItems = cart.map(item => ({ name: item.name, quantity: item.quantity }));
            if (kitchenOrderItems.length > 0) {
                await db.collection('kitchenQueue').doc(String(newTicketNumber)).set({
                    ticketNumber: newTicketNumber,
                    items: kitchenOrderItems,
                    orderTimestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    status: "pending"
                });
            }

            // ★★★ Googleスプレッドシートへデータを送信 ★★★
            const logData = {
                paymentMethod,
                totalAmount,
                fee,
                discountAmount: currentDiscount.amount,
                items: cart
            };

            await fetch(GAS_WEB_APP_URL, {
                method: 'POST',
                mode: 'no-cors', // CORSエラーを回避
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(logData)
            });

            alert(`会計完了。`);
            clearCart();
            paymentConfirmModal.classList.add('hidden');
            cashlessPaymentModal.classList.add('hidden');
        } catch (error) {
            console.error("会計処理エラー: ", error);
            alert(`会計完了。\n整理番号: ${newTicketNumber}\n合計: ${totalAmount}円`);        }
    }

    /**
     * カートの内容と支払いステータスをお会計表示画面用にFirestoreに保存する
     * @param {string} [paymentStatus='menu'] - 'menu', 'cash', 'credit_card'など
     */
    async function updateCustomerDisplay(paymentStatus = 'menu') {
        const total = parseFloat(totalAmountSpan.textContent) || 0;
        const items = cart.map(item => ({
            name: item.name,
            quantity: item.quantity,
            subtotal: item.price * item.quantity
        }));
        
        try {
            await db.collection('customerDisplay').doc('currentCart').set({ 
                items, 
                total,
                paymentStatus // ★支払いステータスを追加
            });
        } catch (error) {
            console.error("お会計表示画面へのデータ送信エラー:", error);
        }
    }

    // addToCart, removeFromCart, clearCart の各関数の最後に updateCustomerDisplay(); を追加
    function addToCart(product) {
        const existingItem = cart.find(item => item.id === product.id);
        if (existingItem) {
            existingItem.quantity++;
        } else {
            cart.push({ ...product, quantity: 1 });
        }
        renderCart();
        updateCustomerDisplay(); // ★この呼び出しが重要
    }
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
        updateCustomerDisplay(); // ★この呼び出しが重要
    }
    function clearCart() {
        cart = [];
        clearDiscount();
        renderCart();
        updateCustomerDisplay('menu'); // ★この呼び出しが重要
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

    // 「調理完了」にする処理
    async function moveTicketToReady(ticketNumber) {
        if (!confirm(`整理番号 ${ticketNumber} を調理完了にし、「お渡し可能」に移動しますか？`)) return;
        await db.runTransaction(async (transaction) => {
            const queueDoc = await transaction.get(queueStatusRef);
            if (!queueDoc.exists) throw "Error";
            transaction.update(queueStatusRef, {
                makingTickets: firebase.firestore.FieldValue.arrayRemove(ticketNumber),
                readyTickets: firebase.firestore.FieldValue.arrayUnion(ticketNumber)
            });
        });
    }

    // 「お渡し完了」にする処理
    async function completeServing(ticketNumber) {
        if (!confirm(`整理番号 ${ticketNumber} のお渡しを完了しますか？`)) return;
        await db.runTransaction(async (transaction) => {
            const queueDoc = await transaction.get(queueStatusRef);
            if (!queueDoc.exists) throw "Error";
            transaction.update(queueStatusRef, {
                readyTickets: firebase.firestore.FieldValue.arrayRemove(ticketNumber),
                waitingCount: firebase.firestore.FieldValue.increment(-1)
            });
        });
    }

    /**
     * レジ内の現金枚数を更新する（簡易版）
     * @param {number} salesAmount - 売上金額
     * @param {number} changeAmount - お釣り金額
     */
    function updateCashInDrawer(salesAmount, changeAmount) {
        // この関数は簡易的なシミュレーションです。
        // 正確な枚数管理には、お釣りをどの金種で渡したかの計算が必要です。
        // ここでは、1000円札が増え、100円玉と10円玉が減るという仮定で実装します。
        if (cashInDrawer['1000']) {
            cashInDrawer['1000'] += Math.floor(salesAmount / 1000);
        }
        if (cashInDrawer['100']) {
            cashInDrawer['100'] -= Math.floor(changeAmount / 100);
        }
        if (cashInDrawer['10']) {
            cashInDrawer['10'] -= Math.floor((changeAmount % 100) / 10);
        }
        console.log("レジ内現金を更新しました:", cashInDrawer);
    }

    /**
     * 釣銭の枚数がしきい値以下になっていないかチェックし、アラートを発行/解除する
     * @param {object} config - Firestoreから取得したcashConfigデータ
     */
    function checkCashLevels(config) {
        if (!config || !config.thresholds || !config.denominations) return;

        const thresholds = config.thresholds;
        const denominations = config.denominations;

        Object.keys(thresholds).forEach(value => {
            const thresholdCount = thresholds[value];
            const currentCount = cashInDrawer[value] || 0;
            const alertId = `cash_level_${value}`;
            const coinName = denominations[value] || `${value}円`;

            if (currentCount <= thresholdCount) {
                // しきい値以下ならアラートを追加
                addAlert(alertId, `釣銭準備金がもうすぐなくなります。${coinName}を補充してください。`);
            } else {
                // しきい値を超えていれば、もしアラートがあれば解除
                removeAlert(alertId);
            }
        });
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
                if (key === 'C') {
                    modalAmountReceivedInput.value = '0';
                } else if (key === 'BS') {
                    modalAmountReceivedInput.value = currentVal.length > 1 ? currentVal.slice(0, -1) : '0';
                } else {
                    modalAmountReceivedInput.value = currentVal === '0' ? key : currentVal + key;
                }
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

    // --- 6. サービスタブの機能 ---
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

    // --- 7. 業務タブの機能 ---
    function setupOperationButtons() {
        if (!operationListDiv) return;
        operationListDiv.innerHTML = '';
        [
            { name: '作成指示画面(店用)', action: () => window.open('kitchen-prep.html', '_blank') },
            { name: '作成管理画面(店用)', action: () => window.open('kitchen-complete.html', '_blank') }, // kitchen-display.htmlから変更
            { name: '呼出画面(客用)', action: () => window.open('queue-display.html', '_blank') },
            { name: '会計画面(客用)', action: () => window.open('customer-display.html', '_blank') },
            { name: '呼出管理(店用)', action: openServingControlModal }, // ★新しいモーダルを開く関数
            { name: '販売数確認', action: openSalesStatsModal },
            { name: '値引き', action: () => discountModal.classList.remove('hidden') },
            { name: '売上外入金', action: () => donationModal.classList.remove('hidden') },
            { name: 'レジ点検', action: openCashCheckModal }
        ].forEach(item => {
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
            sales.forEach(sale => {
                if (sale.items && Array.isArray(sale.items)) {
                    sale.items.forEach(item => {
                        itemCounts[item.name] = (itemCounts[item.name] || 0) + item.quantity;
                    });
                }
            });
            listEl.innerHTML = '<h5>商品別販売数</h5><ul>' + 
                Object.entries(itemCounts).map(([name, count]) => `<li><span>${name}</span><span>${count}個</span></li>`).join('') + '</ul>';

            const hourlySales = Array(8).fill(0);
            sales.forEach(sale => {
                if (sale.timestamp && sale.timestamp.toDate) {
                    const hour = sale.timestamp.toDate().getHours();
                    hourlySales[Math.floor(hour / 3)] += sale.totalAmount;
                }
            });

            if (salesChartInstance) salesChartInstance.destroy();
            const ctx = document.getElementById('sales-chart').getContext('2d');
            salesChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['0-3', '3-6', '6-9', '9-12', '12-15', '15-18', '18-21', '21-24'],
                    datasets: [{ label: '3時間ごとの売上 (円)', data: hourlySales, backgroundColor: 'rgba(0, 160, 233, 0.6)' }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        } catch (error) {
            console.error("販売数データ取得エラー:", error);
            listEl.innerHTML = '<p style="color:red;">データ取得に失敗しました。</p>';
        }
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

    async function openCashCheckModal() {
        cashCheckModal.classList.remove('hidden');
        const contentEl = document.getElementById('cash-check-content');
        const theoreticalBalanceEl = document.getElementById('theoretical-balance');
        const actualBalanceEl = document.getElementById('actual-balance');
        const differenceEl = document.getElementById('balance-difference');
        const completeButton = document.getElementById('complete-cash-check-btn');

        contentEl.innerHTML = '<p>データを読み込み中...</p>';
        theoreticalBalanceEl.textContent = '計算中...';
        actualBalanceEl.textContent = '0';
        differenceEl.textContent = '0';
        
        try {
            // --- 1. 必要なデータを並行して取得 ---
            const [configDoc, salesSnapshot, donationsSnapshot] = await Promise.all([
                db.collection('setting').doc('cashConfig').get(),
                db.collection('sales').get(),
                db.collection('donations').get()
            ]);

            if (!configDoc.exists) {
                contentEl.innerHTML = '<p style="color:red;">釣銭設定が見つかりません。</p>';
                return;
            }

            // --- 2. 理論残高を計算 ---
            const cashConfig = configDoc.data();
            const initialAmount = cashConfig.initialAmount || 0;
            const totalSales = salesSnapshot.docs.reduce((sum, doc) => sum + doc.data().totalAmount, 0);
            const totalDonations = donationsSnapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
            const theoreticalBalance = initialAmount + totalSales + totalDonations;
            
            theoreticalBalanceEl.textContent = theoreticalBalance;

            // --- 3. 金種入力欄を描画 ---
            const denominations = cashConfig.denominations;
            contentEl.innerHTML = '';
            Object.entries(denominations).sort((a, b) => b[0] - a[0]).forEach(([value, name]) => {
                contentEl.innerHTML += `<div class="modal-input-group"><label>${name}:</label><input type="number" class="cash-count" data-value="${value}" placeholder="枚数"><span>枚</span></div>`;
            });

            // --- 4. イベントリスナーを設定 ---
            contentEl.querySelectorAll('.cash-count').forEach(input => {
                input.addEventListener('input', () => calculateActualBalance(theoreticalBalance));
            });
            
            // ★★★★★ ここからが修正箇所 ★★★★★
            // 「点検完了」ボタンの処理を更新
            completeButton.onclick = () => {
                // 差額を取得
                const difference = parseInt(differenceEl.textContent) || 0;
                const alertId = 'cash_check_difference'; // 差額アラート用のID

                // 差額がある場合のみアラートを追加
                if (difference !== 0) {
                    const diffMessage = `${Math.abs(difference)}円の差額があります。確認してください。`;
                    addAlert(alertId, diffMessage);
                } else {
                    // 差額がなければ、もし既存の差額アラートがあれば解除する
                    removeAlert(alertId);
                }

                // 元々のレジ点検時刻アラートは必ず解除する
                removeAlert('cash_check'); 
                
                cashCheckModal.classList.add('hidden');
                alert('レジ点検を完了しました。');
            };
            // ★★★★★ ここまでが修正箇所 ★★★★★

        } catch (error) {
            console.error("レジ点検データの読み込みエラー:", error);
            contentEl.innerHTML = '<p style="color:red;">データ読み込みに失敗しました。</p>';
        }
    }

// calculateActualBalance関数も過不足計算機能を追加して修正
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

    // 過不足に応じて色を変更
    differenceSpan.classList.remove('plus', 'minus');
    if (difference > 0) {
        differenceSpan.classList.add('plus');
    } else if (difference < 0) {
        differenceSpan.classList.add('minus');
    }
}

    // --- 初期化処理の実行 ---
    initialize();
});