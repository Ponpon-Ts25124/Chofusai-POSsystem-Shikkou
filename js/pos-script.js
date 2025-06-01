// js/pos-script.js
document.addEventListener('DOMContentLoaded', () => {
    const productListDiv = document.getElementById('product-list');
    const cartItemsUl = document.getElementById('cart-items');
    const totalAmountSpan = document.getElementById('total-amount');
    const checkoutButton = document.getElementById('checkout-button');
    const clearCartButton = document.getElementById('clear-cart-button');
    const servingTicketAdminSpan = document.getElementById('serving-ticket-admin'); // POS画面内の呼び出し中番号
    const nextCustomerButton = document.getElementById('next-customer-button'); // POS画面内の「次の番号へ」

    // 返品/取消用
    const searchTicketNumberInput = document.getElementById('search-ticket-number');
    const searchTransactionButton = document.getElementById('search-transaction-button');
    const transactionDetailsDiv = document.getElementById('transaction-details');
    const detailTicketNumberSpan = document.getElementById('detail-ticket-number');
    const detailTimestampSpan = document.getElementById('detail-timestamp');
    const detailTotalAmountSpan = document.getElementById('detail-total-amount');
    const detailItemsUl = document.getElementById('detail-items');
    const detailStatusSpan = document.getElementById('detail-status');
    const refundTransactionButton = document.getElementById('refund-transaction-button');
    const cancelLatestTransactionButton = document.getElementById('cancel-latest-transaction-button');
    let currentFoundSaleId = null;

    // POS画面 整理番号操作用
    const posLatestTicketSpan = document.getElementById('pos-latest-ticket');
    const ticketNumberInput = document.getElementById('ticket-number-input');
    const openTicketOptionsButton = document.getElementById('open-ticket-options-button');
    const ticketOptionsModal = document.getElementById('ticket-options-modal');
    const closeModalButton = document.querySelector('.close-modal-button');
    const modalTicketNumberDisplay = document.getElementById('modal-ticket-number-display');
    const modalOptionCancelOrderButton = document.getElementById('modal-option-cancel-order');
    const modalOptionMarkServedButton = document.getElementById('modal-option-mark-served');
    const modalOptionBackButton = document.getElementById('modal-option-back');
    let currentOperatingTicket = null;


    let cart = [];
    let products = [];
    const queueStatusRef = db.collection('queue').doc('currentStatus');

    // --- Firestoreから商品データを読み込む ---
    async function fetchProducts() {
        try {
            if (typeof db === 'undefined') {
                console.error("Firestore 'db' instance is not defined in fetchProducts.");
                alert("データベース接続エラー: dbが未定義です。");
                return;
            }
            const snapshot = await db.collection('products').orderBy('order', 'asc').get();
            products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderProducts();
        } catch (error) {
            console.error("Error fetching products: ", error);
            if (productListDiv) productListDiv.innerHTML = '<p style="color: red;">商品データの読み込みに失敗しました。</p>';
            alert("商品データの読み込みに失敗しました。\n" + error.message);
        }
    }

    function renderProducts() {
        if (!productListDiv) return;
        productListDiv.innerHTML = '';
        products.forEach(product => {
            const button = document.createElement('button');
            button.textContent = `${product.name} (${product.price}円)`;
            button.dataset.productId = product.id;
            button.addEventListener('click', () => addToCart(product));
            productListDiv.appendChild(button);
        });
    }

    function addToCart(product) {
        const existingItem = cart.find(item => item.id === product.id);
        if (existingItem) {
            existingItem.quantity++;
        } else {
            cart.push({ ...product, quantity: 1 });
        }
        renderCart();
    }

    function renderCart() {
        if (!cartItemsUl || !totalAmountSpan) return;
        cartItemsUl.innerHTML = '';
        let total = 0;
        cart.forEach(item => {
            const li = document.createElement('li');
            li.textContent = `${item.name} x ${item.quantity} - ${item.price * item.quantity}円`;
            cartItemsUl.appendChild(li);
            total += item.price * item.quantity;
        });
        totalAmountSpan.textContent = total;
    }

    clearCartButton?.addEventListener('click', () => {
        cart = [];
        renderCart();
    });

    // --- 厨房キューへの追加 ---
    async function addOrderToKitchenQueue(ticketNumber, items) {
        console.log(`Attempting to add order ${ticketNumber} to kitchen queue with items:`, items); // ★デバッグ用ログ
        try {
            await db.collection('kitchenQueue').doc(String(ticketNumber)).set({
                ticketNumber: parseInt(ticketNumber),
                items: items,
                orderTimestamp: firebase.firestore.FieldValue.serverTimestamp(), // ★正しいタイムスタンプ
                status: "pending"
            });
            console.log(`Order ${ticketNumber} successfully added to kitchen queue.`); // ★成功ログ
        } catch (error) {
            console.error(`Error adding order ${ticketNumber} to kitchen queue: `, error); // ★エラーログ
        }
    }

    // --- 厨房キューからの削除 ---
    async function removeOrderFromKitchenQueue(ticketNumber) {
        try {
            await db.collection('kitchenQueue').doc(String(ticketNumber)).delete();
            console.log(`Order ${ticketNumber} removed from kitchen queue.`);
        } catch (error) {
            if (error.code === 'not-found') {
                console.log(`Order ${ticketNumber} not found in kitchen queue, likely already removed.`);
            } else {
                console.error(`Error removing order ${ticketNumber} from kitchen queue: `, error);
            }
        }
    }

    // 会計処理 (`checkoutButton` のイベントリスナー内)
    checkoutButton?.addEventListener('click', async () => {
        if (cart.length === 0) {
            alert("カートが空です。");
            return;
        }
        const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        let newTicketNumber; // スコープを外に出す
        try {
            console.log("Checkout process started..."); // ★デバッグ用ログ
            newTicketNumber = await db.runTransaction(async (transaction) => {
                // ... (既存の整理券発行トランザクション) ...
                const queueDoc = await transaction.get(queueStatusRef);
                if (!queueDoc.exists) {
                    transaction.set(queueStatusRef, { lastIssuedTicket: 1, servingTicket: 0, waitingCount: 1 });
                    return 1;
                }
                const currentLastTicket = queueDoc.data().lastIssuedTicket || 0;
                const newLastTicket = currentLastTicket + 1;
                transaction.update(queueStatusRef, {
                    lastIssuedTicket: newLastTicket,
                    waitingCount: firebase.firestore.FieldValue.increment(1)
                });
                return newLastTicket;
            });
            console.log("New ticket number issued:", newTicketNumber); // ★デバッグ用ログ

            await db.collection('sales').add({
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                items: cart.map(item => ({
                    productId: item.id, name: item.name, price: item.price, quantity: item.quantity
                })),
                totalAmount: totalAmount,
                paymentMethod: "cash",
                ticketNumber: newTicketNumber,
                status: "completed"
            });
            console.log("Sales data added for ticket:", newTicketNumber); // ★デバッグ用ログ

            if (cart.length > 0 && newTicketNumber) {
                const kitchenOrderItems = cart.map(item => ({
                    productId: item.id,
                    name: item.name,
                    quantity: item.quantity
                }));
                await addOrderToKitchenQueue(newTicketNumber, kitchenOrderItems); // 厨房リストに追加
            } else {
                console.warn("Cart was empty or newTicketNumber was not generated when trying to add to kitchen queue."); // ★警告ログ
            }

            alert(`会計完了。\n整理番号: ${newTicketNumber}\n合計: ${totalAmount}円`);
            cart = [];
            renderCart();

        } catch (error) {
            console.error("Error during checkout: ", error);
            alert("会計処理中にエラーが発生しました。");
        }
    });
    

    // --- POS画面の呼び出し番号管理 ---
    queueStatusRef.onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            if (servingTicketAdminSpan) servingTicketAdminSpan.textContent = data.servingTicket || 0;
            if (posLatestTicketSpan) posLatestTicketSpan.textContent = data.lastIssuedTicket || 'N/A';
        } else {
            if (servingTicketAdminSpan) servingTicketAdminSpan.textContent = 'N/A';
            if (posLatestTicketSpan) posLatestTicketSpan.textContent = 'N/A';
        }
    });

    nextCustomerButton?.addEventListener('click', async () => {
        try {
            await db.runTransaction(async (transaction) => {
                const queueDoc = await transaction.get(queueStatusRef);
                if (!queueDoc.exists) throw "Queue status document does not exist!";
                const data = queueDoc.data();
                const currentServing = data.servingTicket || 0;
                const lastIssued = data.lastIssuedTicket || 0;
                if (currentServing < lastIssued) {
                    const newServingTicket = currentServing + 1;
                    const currentWaiting = data.waitingCount || 0;
                    transaction.update(queueStatusRef, {
                        servingTicket: newServingTicket,
                        // waitingCountは会計時と受取済/取消時に操作するので、ここでは触らない方が良い場合も。
                        // もし呼び出しで減らすなら、その番号が実際に処理されたかの確認が必要。
                        // 今回はwaitingCountは会計時と受取済/取消時に操作する前提。
                    });
                    console.log(`Now serving ticket: ${newServingTicket}`);
                } else {
                    alert("これ以上進める整理券がありません。");
                }
            });
        } catch (error) {
            console.error("Error advancing ticket: ", error);
            alert("整理券の更新中にエラーが発生しました。");
        }
    });

    // --- 整理番号操作モーダル関連 ---
    openTicketOptionsButton?.addEventListener('click', () => {
        if (!ticketNumberInput || !ticketOptionsModal || !modalTicketNumberDisplay) return;
        const ticketNumber = parseInt(ticketNumberInput.value);
        if (isNaN(ticketNumber) || ticketNumber <= 0) {
            alert("有効な整理番号を入力してください。");
            return;
        }
        currentOperatingTicket = ticketNumber;
        modalTicketNumberDisplay.textContent = currentOperatingTicket;
        ticketOptionsModal.classList.remove('hidden');
    });

    function closeModal() {
        if (!ticketOptionsModal || !ticketNumberInput) return;
        ticketOptionsModal.classList.add('hidden');
        currentOperatingTicket = null;
        ticketNumberInput.value = '';
    }
    closeModalButton?.addEventListener('click', closeModal);
    modalOptionBackButton?.addEventListener('click', closeModal);
    window.addEventListener('click', (event) => {
        if (event.target == ticketOptionsModal) {
            closeModal();
        }
    });

    modalOptionCancelOrderButton?.addEventListener('click', async () => {
        if (!currentOperatingTicket) return;
        if (!confirm(`整理番号 ${currentOperatingTicket} の注文を本当に取り消しますか？`)) return;
        try {
            const salesQuery = await db.collection('sales').where("ticketNumber", "==", currentOperatingTicket).get();
            if (salesQuery.empty) {
                alert("該当する取引記録が見つかりません。"); closeModal(); return;
            }
            const saleDoc = salesQuery.docs[0];
            if (saleDoc.data().status === "cancelled" || saleDoc.data().status === "refunded") {
                alert("この取引は既に取り消しまたは返品済みです。"); closeModal(); return;
            }
            await db.collection('sales').doc(saleDoc.id).update({
                status: "cancelled", modifiedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            await db.runTransaction(async (transaction) => { // 待ち人数調整
                const queueDoc = await transaction.get(queueStatusRef);
                if (queueDoc.exists && (queueDoc.data().waitingCount || 0) > 0) {
                     // 取消対象がまだ呼び出されていない（servingTicketより大きい）場合のみ減らす
                     if (currentOperatingTicket > (queueDoc.data().servingTicket || 0)) {
                        transaction.update(queueStatusRef, {
                            waitingCount: firebase.firestore.FieldValue.increment(-1)
                        });
                     }
                }
            });
            await removeOrderFromKitchenQueue(currentOperatingTicket);
            alert(`整理番号 ${currentOperatingTicket} の注文を取り消しました。`);
            closeModal();
        } catch (error) {
            console.error("Error cancelling order from modal: ", error);
            alert("注文取消処理中にエラーが発生しました。");
        }
    });

    modalOptionMarkServedButton?.addEventListener('click', async () => {
        if (!currentOperatingTicket) return;
        if (!confirm(`整理番号 ${currentOperatingTicket} を受取済にしますか？`)) return;
        try {
            await db.runTransaction(async (transaction) => {
                const queueDoc = await transaction.get(queueStatusRef);
                if (queueDoc.exists && (queueDoc.data().waitingCount || 0) > 0) {
                     // 受取済にする番号がまだ未処理（servingTicketより大きい、または等しい）の場合のみ減らす
                     if (currentOperatingTicket >= (queueDoc.data().servingTicket || 0)) {
                         transaction.update(queueStatusRef, {
                             waitingCount: firebase.firestore.FieldValue.increment(-1)
                         });
                     }
                }
            });
            const salesQuery = await db.collection('sales').where("ticketNumber", "==", currentOperatingTicket).limit(1).get();
            if (!salesQuery.empty) {
                await db.collection('sales').doc(salesQuery.docs[0].id).update({
                    servedAt: firebase.firestore.FieldValue.serverTimestamp(), status: "served" // statusも更新
                });
            }
            await removeOrderFromKitchenQueue(currentOperatingTicket);
            alert(`整理番号 ${currentOperatingTicket} を受取済として処理しました。`);
            closeModal();
        } catch (error) {
            console.error("Error marking order as served: ", error);
            alert("受取済処理中にエラーが発生しました。");
        }
    });


    // --- 返品/取消機能 (既存のもの) ---
    cancelLatestTransactionButton?.addEventListener('click', async () => {
        if (!confirm("最新の会計を取り消しますか？整理券が無効になり、待ち人数が調整されます。")) return;
        try {
            const salesRef = db.collection('sales').orderBy('timestamp', 'desc').limit(1);
            const snapshot = await salesRef.get();
            if (snapshot.empty) { alert("取消対象の取引なし"); return; }
            const latestSaleDoc = snapshot.docs[0];
            const latestSaleData = latestSaleDoc.data();
            if (latestSaleData.status === "cancelled" || latestSaleData.status === "refunded") {
                alert("最新の取引は既に取消/返品済みです。"); return;
            }
            await db.collection('sales').doc(latestSaleDoc.id).update({
                status: "cancelled", modifiedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            await db.runTransaction(async (transaction) => {
                const queueDoc = await transaction.get(queueStatusRef);
                if (queueDoc.exists && (queueDoc.data().waitingCount || 0) > 0) {
                     if (latestSaleData.ticketNumber > (queueDoc.data().servingTicket || 0)) {
                        transaction.update(queueStatusRef, { waitingCount: firebase.firestore.FieldValue.increment(-1) });
                     }
                }
            });
            await removeOrderFromKitchenQueue(latestSaleData.ticketNumber); // 厨房からも削除
            alert(`整理番号 ${latestSaleData.ticketNumber} の取引を取り消しました。`);
            if (transactionDetailsDiv) transactionDetailsDiv.style.display = 'none';
        } catch (error) {
            console.error("Error cancelling latest transaction: ", error);
            alert("最新取引の取消中にエラーが発生しました。");
        }
    });

    searchTransactionButton?.addEventListener('click', async () => {
        if(!searchTicketNumberInput || !transactionDetailsDiv) return;
        const ticketNumberToSearch = parseInt(searchTicketNumberInput.value);
        if (isNaN(ticketNumberToSearch)) { alert("有効な整理番号を入力してください。"); return; }
        try {
            const salesRef = db.collection('sales').where("ticketNumber", "==", ticketNumberToSearch);
            const snapshot = await salesRef.get();
            if (snapshot.empty) {
                alert("該当する取引が見つかりません。"); transactionDetailsDiv.style.display = 'none'; currentFoundSaleId = null; return;
            }
            const saleDoc = snapshot.docs[0];
            currentFoundSaleId = saleDoc.id;
            const saleData = saleDoc.data();

            if(detailTicketNumberSpan) detailTicketNumberSpan.textContent = saleData.ticketNumber;
            if(detailTimestampSpan) detailTimestampSpan.textContent = saleData.timestamp ? new Date(saleData.timestamp.seconds * 1000).toLocaleString() : 'N/A';
            if(detailTotalAmountSpan) detailTotalAmountSpan.textContent = saleData.totalAmount;
            if(detailStatusSpan) detailStatusSpan.textContent = saleData.status || "completed";
            if(detailItemsUl) {
                detailItemsUl.innerHTML = '';
                saleData.items.forEach(item => {
                    const li = document.createElement('li');
                    li.textContent = `${item.name} x ${item.quantity} (${item.price * item.quantity}円)`;
                    detailItemsUl.appendChild(li);
                });
            }
            transactionDetailsDiv.style.display = 'block';
            if (refundTransactionButton) {
                if (saleData.status !== "completed") {
                    refundTransactionButton.style.display = 'none';
                    alert(`この取引は既に「${saleData.status}」です。`);
                } else {
                    refundTransactionButton.style.display = 'inline-block';
                }
            }
        } catch (error) {
            console.error("Error searching transaction: ", error);
            alert("取引の検索中にエラーが発生しました。");
            transactionDetailsDiv.style.display = 'none'; currentFoundSaleId = null;
        }
    });

    refundTransactionButton?.addEventListener('click', async () => {
        if (!currentFoundSaleId) { alert("返品対象の取引が選択されていません。"); return; }
        if (!confirm("この取引を返品処理しますか？")) return;
        try {
            // salesコレクションのstatusを "refunded" に更新
            await db.collection('sales').doc(currentFoundSaleId).update({
                status: "refunded", modifiedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            // waitingCount や厨房リストへの影響はここでは考慮しない (返品は一度提供後の想定)
            // もし返品時に待ち人数を減らすなら、その整理番号がまだ有効（未来の番号）か確認が必要。
            alert("取引を返品済みに更新しました。");
            if(detailStatusSpan) detailStatusSpan.textContent = "refunded";
            if(refundTransactionButton) refundTransactionButton.style.display = 'none';
            currentFoundSaleId = null;
            if(searchTicketNumberInput) searchTicketNumberInput.value = '';
        } catch (error) {
            console.error("Error refunding transaction: ", error);
            alert("返品処理中にエラーが発生しました。");
        }
    });


    // 初期化処理
    async function initializePos() {
        if (typeof firebase === 'undefined' || typeof db === 'undefined') {
            console.error("Firebase or DB not initialized at POS initialize function.");
            return;
        }
        await fetchProducts();

        const doc = await queueStatusRef.get();
        if (!doc.exists) {
            try {
                await queueStatusRef.set({ lastIssuedTicket: 0, servingTicket: 0, waitingCount: 0 });
                console.log("Initialized queue status on POS page.");
            } catch (e) {
                console.error("Error initializing queue status on POS page:", e);
            }
        }
    }
    initializePos();
});