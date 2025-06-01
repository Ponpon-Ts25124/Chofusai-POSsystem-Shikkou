// js/pos-script.js
document.addEventListener('DOMContentLoaded', () => {
    const productListDiv = document.getElementById('product-list');
    const cartItemsUl = document.getElementById('cart-items');
    // ... (他の要素取得は前回のコードと同じなので省略) ...
    const servingTicketAdminSpan = document.getElementById('serving-ticket-admin');
    const nextCustomerButton = document.getElementById('next-customer-button');
    const posLatestTicketSpan = document.getElementById('pos-latest-ticket');
    // ... (モーダル関連の要素取得も省略) ...
    const ticketOptionsModal = document.getElementById('ticket-options-modal');
    const closeModalButton = document.querySelector('.close-modal-button');
    const modalTicketNumberDisplay = document.getElementById('modal-ticket-number-display');
    // ... (返品/取消関連の要素取得も省略) ...
    const transactionDetailsDiv = document.getElementById('transaction-details');


    let cart = [];
    let products = [];
    let currentOperatingTicket = null; // モーダル操作用
    let currentFoundSaleId = null; // 返品検索用
    const queueStatusRef = db.collection('queue').doc('currentStatus');

    async function fetchProducts() { /* ... (変更なし、前回のコード) ... */ }
    function renderProducts() { /* ... (変更なし、前回のコード) ... */ }
    function addToCart(product) { /* ... (変更なし、前回のコード) ... */ }
    function renderCart() { /* ... (変更なし、前回のコード) ... */ }
    document.getElementById('clear-cart-button')?.addEventListener('click', () => { cart = []; renderCart(); });

    async function addOrderToKitchenQueue(ticketNumber, items) { /* ... (変更なし、前回のコード) ... */ }
    async function removeOrderFromKitchenQueue(ticketNumber) { /* ... (変更なし、前回のコード) ... */ }

    document.getElementById('checkout-button')?.addEventListener('click', async () => {
        if (cart.length === 0) { alert("カートが空です。"); return; }
        const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        let newTicketNumber;
        try {
            newTicketNumber = await db.runTransaction(async (transaction) => {
                const queueDoc = await transaction.get(queueStatusRef);
                const currentData = queueDoc.data() || {};
                const lastIssued = currentData.lastIssuedTicket || 0;
                const newLast = lastIssued + 1;
                const newWaiting = (currentData.waitingCount || 0) + 1;
                const preparing = Array.isArray(currentData.preparingTickets) ? currentData.preparingTickets : [];
                const ready = Array.isArray(currentData.readyTickets) ? currentData.readyTickets : [];

                transaction.set(queueStatusRef, {
                    lastIssuedTicket: newLast,
                    servingTicket: currentData.servingTicket || 0,
                    waitingCount: newWaiting,
                    preparingTickets: firebase.firestore.FieldValue.arrayUnion(newLast),
                    readyTickets: ready // 既存のreadyTicketsを維持
                }, { merge: true });
                return newLast;
            });

            await db.collection('sales').add({ /* ... (salesデータ) ... */ ticketNumber: newTicketNumber, status: "completed" });
            if (cart.length > 0 && newTicketNumber) {
                const kitchenOrderItems = cart.map(item => ({ productId: item.id, name: item.name, quantity: item.quantity }));
                await addOrderToKitchenQueue(newTicketNumber, kitchenOrderItems);
            }
            alert(`会計完了。\n整理番号: ${newTicketNumber}\n合計: ${totalAmount}円`);
            cart = []; renderCart();
        } catch (error) { console.error("Error during checkout: ", error); alert("会計処理中にエラーが発生しました。"); }
    });

    queueStatusRef.onSnapshot(doc => { /* ... (変更なし、前回のコード) ... */ });

    nextCustomerButton?.addEventListener('click', async () => { // ★★★ ロジック変更 ★★★
        console.log("Next customer button clicked.");
        try {
            await db.runTransaction(async (transaction) => {
                const queueDoc = await transaction.get(queueStatusRef);
                if (!queueDoc.exists) throw "Queue status document does not exist!";
                const data = queueDoc.data();
                const currentServing = data.servingTicket || 0;
                const lastIssued = data.lastIssuedTicket || 0;

                if (currentServing < lastIssued) {
                    const newServingTicket = currentServing + 1;
                    console.log(`Advancing to new serving ticket: ${newServingTicket}`);
                    const updates = { servingTicket: newServingTicket };

                    const preparing = Array.isArray(data.preparingTickets) ? data.preparingTickets : [];
                    if (preparing.includes(newServingTicket)) {
                        updates.preparingTickets = firebase.firestore.FieldValue.arrayRemove(newServingTicket);
                        updates.readyTickets = firebase.firestore.FieldValue.arrayUnion(newServingTicket);
                        console.log(`Ticket ${newServingTicket} moved from preparing to ready.`);
                    } else {
                        // preparingになく、まだreadyにもない場合 (会計直後など、まだpreparingに追加される前の可能性は低いが念のため)
                        // または既に手動でreadyに移動されている場合
                        const ready = Array.isArray(data.readyTickets) ? data.readyTickets : [];
                        if (!ready.includes(newServingTicket)) {
                            // まだどこにも分類されてない番号を呼び出す場合、強制的にreadyに入れる
                            updates.readyTickets = firebase.firestore.FieldValue.arrayUnion(newServingTicket);
                            console.log(`Ticket ${newServingTicket} was not in preparing, added to ready.`);
                        }
                    }
                    transaction.update(queueStatusRef, updates);
                } else {
                    alert("これ以上進める整理券がありません。");
                }
            });
        } catch (error) { console.error("Error advancing ticket: ", error); alert("整理券更新エラー。\n" + error.message); }
    });

    // --- モーダル関連 (open, close, cancel, served) ---
    document.getElementById('open-ticket-options-button')?.addEventListener('click', () => { /* ... (変更なし、前回のコード) ... */ });
    function closeModal() { /* ... (変更なし、前回のコード) ... */ }
    document.querySelector('.close-modal-button')?.addEventListener('click', closeModal);
    document.getElementById('modal-option-back')?.addEventListener('click', closeModal);
    window.addEventListener('click', (event) => { if (event.target == ticketOptionsModal) closeModal(); });

    document.getElementById('modal-option-cancel-order')?.addEventListener('click', async () => { /* ★★★ preparing/readyTickets から削除 */
        if (!currentOperatingTicket) return; if (!confirm(`整理番号 ${currentOperatingTicket} の注文を本当に取り消しますか？`)) return;
        try {
            const salesQuery = await db.collection('sales').where("ticketNumber", "==", currentOperatingTicket).get();
            if (salesQuery.empty) { alert("該当取引なし。"); closeModal(); return; }
            const saleDoc = salesQuery.docs[0];
            if (saleDoc.data().status === "cancelled" || saleDoc.data().status === "refunded") { alert("既に取消/返品済。"); closeModal(); return; }
            await db.collection('sales').doc(saleDoc.id).update({ status: "cancelled", modifiedAt: firebase.firestore.FieldValue.serverTimestamp() });
            await db.runTransaction(async (transaction) => {
                const queueDoc = await transaction.get(queueStatusRef);
                if (queueDoc.exists) {
                    const data = queueDoc.data();
                    const updates = {
                        preparingTickets: firebase.firestore.FieldValue.arrayRemove(currentOperatingTicket),
                        readyTickets: firebase.firestore.FieldValue.arrayRemove(currentOperatingTicket)
                    };
                    if ((data.waitingCount || 0) > 0 && currentOperatingTicket > (data.servingTicket || 0) && currentOperatingTicket <= (data.lastIssuedTicket || 0) ) {
                        updates.waitingCount = firebase.firestore.FieldValue.increment(-1);
                    }
                    transaction.update(queueStatusRef, updates);
                }
            });
            await removeOrderFromKitchenQueue(currentOperatingTicket);
            alert(`整理番号 ${currentOperatingTicket} の注文を取り消しました。`); closeModal();
        } catch (error) { console.error("Error cancelling order: ", error); alert("注文取消エラー。\n" + error.message); }
    });

    document.getElementById('modal-option-mark-served')?.addEventListener('click', async () => { /* ★★★ readyTickets から削除 */
        if (!currentOperatingTicket) return; if (!confirm(`整理番号 ${currentOperatingTicket} を受取済にしますか？`)) return;
        console.log(`Mark Served: Processing ticket ${currentOperatingTicket}`);
        try {
            await db.runTransaction(async (transaction) => {
                const queueDoc = await transaction.get(queueStatusRef);
                if (!queueDoc.exists) throw new Error("Queue status doc does not exist!");
                const data = queueDoc.data(); console.log("Mark Served: Current queue data:", data);
                const updates = {
                    readyTickets: firebase.firestore.FieldValue.arrayRemove(currentOperatingTicket)
                };
                // waitingCountは、その番号がまだ「待ち」状態だった場合にのみ減らす
                // servingTicket <= currentOperatingTicket <= lastIssuedTicket の範囲で、かつreadyTicketsに含まれていた場合
                const ready = Array.isArray(data.readyTickets) ? data.readyTickets : [];
                if ((data.waitingCount || 0) > 0 && ready.includes(currentOperatingTicket) ) {
                     updates.waitingCount = firebase.firestore.FieldValue.increment(-1);
                }
                transaction.update(queueStatusRef, updates);
            });
            console.log(`Mark Served: Queue status updated for ticket ${currentOperatingTicket}`);
            const salesQuery = await db.collection('sales').where("ticketNumber", "==", currentOperatingTicket).limit(1).get();
            if (!salesQuery.empty) { const saleDocId = salesQuery.docs[0].id; await db.collection('sales').doc(saleDocId).update({ servedAt: firebase.firestore.FieldValue.serverTimestamp(), status: "served" }); console.log(`Mark Served: Sales record updated for ticket ${currentOperatingTicket}`); }
            else { console.warn(`Mark Served: No sales record for ticket ${currentOperatingTicket}.`); }
            await removeOrderFromKitchenQueue(currentOperatingTicket);
            alert(`整理番号 ${currentOperatingTicket} を受取済として処理しました。`); closeModal();
        } catch (error) { console.error(`Mark Served: Error processing ticket ${currentOperatingTicket}:`, error); alert(`受取済処理エラー。\n${error.message}`); }
    });

    // --- 返品/取消機能 (既存のもの) ---
    document.getElementById('cancel-latest-transaction-button')?.addEventListener('click', async () => { /* ... (変更なし、前回のコード) ... */ });
    document.getElementById('search-transaction-button')?.addEventListener('click', async () => { /* ... (変更なし、前回のコード) ... */ });
    document.getElementById('refund-transaction-button')?.addEventListener('click', async () => { /* ... (変更なし、前回のコード) ... */ });

    async function initializePos() { // ★★★ 初期化処理で preparingTickets, readyTickets を確実に作る
        if (typeof firebase === 'undefined' || typeof db === 'undefined') { console.error("Firebase/DB not initialized."); return; }
        await fetchProducts();
        const doc = await queueStatusRef.get();
        if (!doc.exists) {
            try { await queueStatusRef.set({ lastIssuedTicket: 0, servingTicket: 0, waitingCount: 0, preparingTickets: [], readyTickets: [] }); console.log("Initialized queue status with preparing/ready arrays."); }
            catch (e) { console.error("Error initializing queue status:", e); }
        } else {
            const data = doc.data(); const updates = {};
            if (!data.hasOwnProperty('preparingTickets')) { updates.preparingTickets = []; }
            if (!data.hasOwnProperty('readyTickets')) { updates.readyTickets = []; }
            if (Object.keys(updates).length > 0) {
                try { await queueStatusRef.update(updates); console.log("Updated existing queue status with preparing/ready arrays."); }
                catch (e) { console.error("Error updating existing queue status:", e); }
            }
        }
    }
    initializePos();
});