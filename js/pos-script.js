// js/pos-script.js
document.addEventListener('DOMContentLoaded', () => {
    const productListDiv = document.getElementById('product-list');
    const cartItemsUl = document.getElementById('cart-items');
    const totalAmountSpan = document.getElementById('total-amount');
    const checkoutButton = document.getElementById('checkout-button');
    const clearCartButton = document.getElementById('clear-cart-button');
    const servingTicketAdminSpan = document.getElementById('serving-ticket-admin');
    const nextCustomerButton = document.getElementById('next-customer-button');

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

    async function addOrderToKitchenQueue(ticketNumber, items) {
        console.log(`Attempting to add order ${ticketNumber} to kitchen queue with items:`, items);
        try {
            await db.collection('kitchenQueue').doc(String(ticketNumber)).set({
                ticketNumber: parseInt(ticketNumber),
                items: items,
                orderTimestamp: firebase.firestore.FieldValue.serverTimestamp(),
                status: "pending"
            });
            console.log(`Order ${ticketNumber} successfully added to kitchen queue.`);
        } catch (error) {
            console.error(`Error adding order ${ticketNumber} to kitchen queue: `, error);
        }
    }

    async function removeOrderFromKitchenQueue(ticketNumber) {
        console.log(`Attempting to remove order ${ticketNumber} from kitchen queue.`);
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

    checkoutButton?.addEventListener('click', async () => {
        if (cart.length === 0) { alert("カートが空です。"); return; }
        const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        let newTicketNumber;
        try {
            console.log("Checkout process started...");
            newTicketNumber = await db.runTransaction(async (transaction) => {
                const queueDoc = await transaction.get(queueStatusRef);
                let data = queueDoc.data() || {};
                if (!queueDoc.exists) {
                    data = { lastIssuedTicket: 0, servingTicket: 0, waitingCount: 0, makingTickets: [], readyTickets: [], displayMode: "normal" };
                }
                const currentLastTicket = data.lastIssuedTicket || 0;
                const newLastTicket = currentLastTicket + 1;
                const newMakingTickets = [...(data.makingTickets || []), newLastTicket];
                const updateData = {
                    lastIssuedTicket: newLastTicket,
                    waitingCount: firebase.firestore.FieldValue.increment(1),
                    makingTickets: newMakingTickets
                };
                 if (typeof data.readyTickets === 'undefined') updateData.readyTickets = []; // 既存データにフィールドがなければ初期化
                 if (typeof data.displayMode === 'undefined') updateData.displayMode = "normal";
                 if (typeof data.servingTicket === 'undefined') updateData.servingTicket = 0;


                if (!queueDoc.exists) {
                     transaction.set(queueStatusRef, updateData);
                } else {
                     transaction.update(queueStatusRef, updateData);
                }
                return newLastTicket;
            });
            console.log("New ticket number issued:", newTicketNumber);

            await db.collection('sales').add({
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                items: cart.map(item => ({ productId: item.id, name: item.name, price: item.price, quantity: item.quantity })),
                totalAmount: totalAmount, paymentMethod: "cash", ticketNumber: newTicketNumber, status: "completed"
            });
            console.log("Sales data added for ticket:", newTicketNumber);

            if (cart.length > 0 && newTicketNumber) {
                const kitchenOrderItems = cart.map(item => ({ productId: item.id, name: item.name, quantity: item.quantity }));
                await addOrderToKitchenQueue(newTicketNumber, kitchenOrderItems);
            } else {
                console.warn("Cart was empty or newTicketNumber was not generated when trying to add to kitchen queue.");
            }
            alert(`会計完了。\n整理番号: ${newTicketNumber}\n合計: ${totalAmount}円`);
            cart = []; renderCart();
        } catch (error) {
            console.error("Error during checkout: ", error); alert("会計処理中にエラーが発生しました。");
        }
    });

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
                let data = queueDoc.data();
                let makingTickets = data.makingTickets || [];
                let readyTickets = data.readyTickets || [];
                let currentServing = data.servingTicket || 0;

                if (makingTickets.length > 0) {
                    const nextToMakeReady = makingTickets.shift();
                    readyTickets.push(nextToMakeReady);
                    currentServing = nextToMakeReady;
                    transaction.update(queueStatusRef, {
                        makingTickets: makingTickets, readyTickets: readyTickets, servingTicket: currentServing
                    });
                    console.log(`Moved ticket ${currentServing} from making to ready. Now serving.`);
                } else if (readyTickets.length > 0 && currentServing !== readyTickets[0]) {
                    currentServing = readyTickets[0];
                    transaction.update(queueStatusRef, { servingTicket: currentServing });
                    console.log(`No new items to make ready. Re-serving ${currentServing} from ready list.`);
                } else {
                    alert("作成中または未呼び出しの受取待ちの整理券がありません。");
                }
            });
        } catch (error) {
            console.error("Error advancing ticket (next customer): ", error); alert("次の番号への処理中にエラーが発生しました。");
        }
    });

    openTicketOptionsButton?.addEventListener('click', () => {
        if (!ticketNumberInput || !ticketOptionsModal || !modalTicketNumberDisplay) return;
        const ticketNumber = parseInt(ticketNumberInput.value);
        if (isNaN(ticketNumber) || ticketNumber <= 0) { alert("有効な整理番号を入力してください。"); return; }
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
    window.addEventListener('click', (event) => { if (event.target == ticketOptionsModal) closeModal(); });

    modalOptionCancelOrderButton?.addEventListener('click', async () => {
        if (!currentOperatingTicket) return;
        if (!confirm(`整理番号 ${currentOperatingTicket} の注文を本当に取り消しますか？`)) return;
        console.log(`Cancel Order: Processing ticket ${currentOperatingTicket}`);
        try {
            const salesQuery = await db.collection('sales').where("ticketNumber", "==", currentOperatingTicket).get();
            if (!salesQuery.empty) {
                const saleDoc = salesQuery.docs[0];
                if (saleDoc.data().status !== "cancelled" && saleDoc.data().status !== "refunded") {
                    await db.collection('sales').doc(saleDoc.id).update({ status: "cancelled", modifiedAt: firebase.firestore.FieldValue.serverTimestamp() });
                } else { alert("この取引は既に取消/返品済みです。"); closeModal(); return; }
            } else { console.warn(`No sales record for ticket ${currentOperatingTicket} to cancel. Proceeding with queue update.`); }

            await db.runTransaction(async (transaction) => {
                const queueDoc = await transaction.get(queueStatusRef);
                if (!queueDoc.exists) return;
                let data = queueDoc.data();
                let makingTickets = data.makingTickets || [];
                let readyTickets = data.readyTickets || [];
                let waitingCount = data.waitingCount || 0;
                let ticketFoundAndRemoved = false;

                const makingIndex = makingTickets.indexOf(currentOperatingTicket);
                if (makingIndex > -1) { makingTickets.splice(makingIndex, 1); ticketFoundAndRemoved = true; }
                const readyIndex = readyTickets.indexOf(currentOperatingTicket);
                if (readyIndex > -1) { readyTickets.splice(readyIndex, 1); ticketFoundAndRemoved = true; }

                if (ticketFoundAndRemoved && waitingCount > 0) waitingCount--;
                
                let newServingTicket = data.servingTicket || 0;
                if (data.servingTicket === currentOperatingTicket) { // もし取消したのが呼び出し中なら
                     if(readyTickets.length > 0) newServingTicket = readyTickets[0];
                     else if (makingTickets.length > 0) newServingTicket = 0; // 次の呼び出しはnextCustomerで
                     else newServingTicket = 0;
                }
                transaction.update(queueStatusRef, {
                    makingTickets: makingTickets, readyTickets: readyTickets,
                    waitingCount: waitingCount, servingTicket: newServingTicket
                });
            });
            await removeOrderFromKitchenQueue(currentOperatingTicket);
            alert(`整理番号 ${currentOperatingTicket} の注文を取り消しました。`); closeModal();
        } catch (error) { console.error(`Cancel Order: Error processing ticket ${currentOperatingTicket}:`, error); alert("注文取消処理中にエラーが発生しました。"); }
    });

    modalOptionMarkServedButton?.addEventListener('click', async () => {
        if (!currentOperatingTicket) { console.warn("Mark Served: currentOperatingTicket is null or undefined."); alert("操作対象の整理番号が選択されていません。"); return; }
        if (!confirm(`整理番号 ${currentOperatingTicket} を受取済にしますか？`)) return;
        console.log(`Mark Served: Processing ticket ${currentOperatingTicket}`);
        try {
            console.log(`Mark Served: Attempting to update queue status for ticket ${currentOperatingTicket}`);
            await db.runTransaction(async (transaction) => {
                const queueDoc = await transaction.get(queueStatusRef);
                if (!queueDoc.exists) { console.error("Mark Served: Queue status document does not exist!"); throw new Error("Queue status document does not exist!"); }
                let data = queueDoc.data();
                console.log("Mark Served: Current queue data:", data);
                let readyTickets = data.readyTickets || [];
                let waitingCount = data.waitingCount || 0;
                let servingTicket = data.servingTicket || 0;

                const readyIndex = readyTickets.indexOf(currentOperatingTicket);
                if (readyIndex > -1) {
                    console.log(`Mark Served: Ticket ${currentOperatingTicket} found in readyTickets. Removing.`);
                    readyTickets.splice(readyIndex, 1);
                    if (waitingCount > 0) waitingCount--;

                    if (servingTicket === currentOperatingTicket) {
                        if (readyTickets.length > 0) servingTicket = readyTickets[0];
                        else servingTicket = 0; // No more ready tickets, next customer will handle making ones
                    }
                    transaction.update(queueStatusRef, { readyTickets: readyTickets, waitingCount: waitingCount, servingTicket: servingTicket });
                } else {
                    console.warn(`Mark Served: Ticket ${currentOperatingTicket} not found in readyTickets. It might be in makingTickets or already processed/cancelled.`);
                    // Optionally, check makingTickets if a ticket can be marked served directly from there
                    const makingIndex = (data.makingTickets || []).indexOf(currentOperatingTicket);
                    if (makingIndex > -1) {
                        console.log(`Mark Served: Ticket ${currentOperatingTicket} found in makingTickets. Removing and decrementing waitingCount.`);
                        let makingTickets = [...data.makingTickets];
                        makingTickets.splice(makingIndex,1);
                        if (waitingCount > 0) waitingCount--;
                        // servingTicketは直接変更しない（nextCustomerButtonで処理される想定）
                        transaction.update(queueStatusRef, { makingTickets: makingTickets, waitingCount: waitingCount });
                    } else {
                        console.log(`Mark Served: Ticket ${currentOperatingTicket} not in making or ready list.`);
                    }
                }
            });
            console.log(`Mark Served: Queue status updated successfully for ticket ${currentOperatingTicket}`);
            console.log(`Mark Served: Attempting to update sales record for ticket ${currentOperatingTicket}`);
            const salesQuery = await db.collection('sales').where("ticketNumber", "==", currentOperatingTicket).limit(1).get();
            if (!salesQuery.empty) {
                const saleDocId = salesQuery.docs[0].id;
                console.log(`Mark Served: Found sales record with ID ${saleDocId} for ticket ${currentOperatingTicket}`);
                await db.collection('sales').doc(saleDocId).update({ servedAt: firebase.firestore.FieldValue.serverTimestamp(), status: "served" });
                console.log(`Mark Served: Sales record updated successfully for ticket ${currentOperatingTicket}`);
            } else {
                console.warn(`Mark Served: No sales record found for ticket ${currentOperatingTicket}.`);
            }
            console.log(`Mark Served: Attempting to remove order from kitchen queue for ticket ${currentOperatingTicket}`);
            await removeOrderFromKitchenQueue(currentOperatingTicket);
            alert(`整理番号 ${currentOperatingTicket} を受取済として処理しました。`); closeModal();
        } catch (error) {
            console.error(`Mark Served: Error processing ticket ${currentOperatingTicket}:`, error);
            alert(`受取済処理中にエラーが発生しました。\nエラーメッセージ: ${error.message}\n詳細はコンソールを確認してください。`);
        }
    });

    cancelLatestTransactionButton?.addEventListener('click', async () => { /* ... (既存のコード、必要なら厨房キュー削除など連携) ... */ });
    searchTransactionButton?.addEventListener('click', async () => { /* ... (既存のコード) ... */ });
    refundTransactionButton?.addEventListener('click', async () => { /* ... (既存のコード) ... */ });

    async function initializePos() {
        await fetchProducts();
        const doc = await queueStatusRef.get();
        if (!doc.exists) {
            try {
                await queueStatusRef.set({
                    lastIssuedTicket: 0, servingTicket: 0, waitingCount: 0,
                    makingTickets: [], readyTickets: [], displayMode: "normal"
                }, { merge: true }); // merge:trueでフィールドがなくてもエラーにならないように
                console.log("Initialized queue status with all fields.");
            } catch (e) { console.error("Error initializing queue status:", e); }
        } else {
             const data = doc.data();
             const updates = {};
             if (typeof data.makingTickets === 'undefined') updates.makingTickets = [];
             if (typeof data.readyTickets === 'undefined') updates.readyTickets = [];
             if (typeof data.displayMode === 'undefined') updates.displayMode = "normal";
             if (typeof data.waitingCount === 'undefined') updates.waitingCount = 0; // waitingCountも確認
             if (typeof data.servingTicket === 'undefined') updates.servingTicket = 0; // servingTicketも確認
             if (typeof data.lastIssuedTicket === 'undefined') updates.lastIssuedTicket = 0; // lastIssuedTicketも確認

             if (Object.keys(updates).length > 0) {
                 console.log("Updating existing queue document with new fields:", updates);
                 await queueStatusRef.update(updates).catch(e => console.error("Error updating queue with new fields:", e));
             }
        }
    }
    initializePos();
});