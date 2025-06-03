// js/pos-script.js
document.addEventListener('DOMContentLoaded', () => {
    console.log("pos-script.js: DOMContentLoaded triggered."); // ★デバッグログ

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
    // 整理番号操作モーダル (ticket-options-modal)
    const ticketOptionsModal = document.getElementById('ticket-options-modal');
    const closeModalButtonForTicketOptions = document.querySelector('#ticket-options-modal .close-modal-button');
    const modalOptionBackButton = document.getElementById('modal-option-back');
    // 会計確認モーダル用要素 (★ここを重点的に確認★)
    const paymentConfirmModal = document.getElementById('payment-confirm-modal');
    const closePaymentModalButtonForPayment = document.getElementById('close-payment-modal-button');
    const modalTotalAmountSpan = document.getElementById('modal-total-amount'); // ★
    const modalAmountReceivedInput = document.getElementById('modal-amount-received'); // ★
    const keypadContainer = document.getElementById('keypad-container');
    const modalChangeDisplayP = document.getElementById('modal-change-display');
    const modalChangeAmountSpan = document.getElementById('modal-change-amount'); // これは modalChangeDisplayP の innerHTML で管理するので不要
    const confirmPaymentButton = document.getElementById('confirm-payment-button'); // ★★★ この取得が成功しているか ★★★
    const cancelPaymentButton = document.getElementById('cancel-payment-button');

    const modalTicketNumberDisplay = document.getElementById('modal-ticket-number-display');
    const modalOptionCancelOrderButton = document.getElementById('modal-option-cancel-order');
    const modalOptionMarkServedButton = document.getElementById('modal-option-mark-served');
    let currentOperatingTicket = null;
    // ★★★ confirmPaymentButton の存在チェックログ ★★★
    if (confirmPaymentButton) {
        console.log("pos-script.js: confirmPaymentButton element FOUND.");
    } else {
        console.error("pos-script.js: ERROR - confirmPaymentButton element NOT FOUND. Check HTML ID.");
        // confirmPaymentButton がないと、これ以降のイベントリスナー登録でエラーになる
    }
    // ★★★ modalTotalAmountSpan, modalAmountReceivedInput の存在チェックログ ★★★
    if (modalTotalAmountSpan) {
        console.log("pos-script.js: modalTotalAmountSpan element FOUND.");
    } else {
        console.error("pos-script.js: ERROR - modalTotalAmountSpan element NOT FOUND. Check HTML ID.");
    }
    if (modalAmountReceivedInput) {
        console.log("pos-script.js: modalAmountReceivedInput element FOUND.");
    } else {
        console.error("pos-script.js: ERROR - modalAmountReceivedInput element NOT FOUND. Check HTML ID.");
    }

    let cart = [];
    let products = [];
    const queueStatusRef = db.collection('queue').doc('currentStatus');

    // --- Firestoreから商品データを読み込む ---
    async function fetchProducts() {
        console.log("pos-script.js: fetchProducts called."); // ★デバッグログ
        try {
            if (typeof db === 'undefined') {
                console.error("pos-script.js: fetchProducts - Firestore 'db' instance is not defined.");
                alert("データベース接続エラー: dbが未定義です。");
                return;
            }
            console.log("pos-script.js: fetchProducts - Attempting to get products from Firestore."); // ★デバッグログ
            const snapshot = await db.collection('products').orderBy('order', 'asc').get();
            console.log("pos-script.js: fetchProducts - Firestore snapshot received. Empty:", snapshot.empty, "Size:", snapshot.size); // ★デバッグログ

            if (snapshot.empty) {
                console.warn("pos-script.js: fetchProducts - No products found in Firestore 'products' collection.");
                products = []; // products配列を空にする
            } else {
                products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                console.log("pos-script.js: fetchProducts - Products mapped:", products); // ★デバッグログ
            }
            renderProducts(); // データ取得後（空でも）に描画関数を呼ぶ
        } catch (error) {
            console.error("pos-script.js: fetchProducts - Error fetching products: ", error); // ★エラーログ
            if (productListDiv) productListDiv.innerHTML = '<p style="color: red;">商品データの読み込みに失敗しました。詳細はコンソールを確認してください。</p>';
            // alert("商品データの読み込みに失敗しました。\n" + error.message); // アラートは状況に応じて
            products = []; // エラー時もproducts配列を空にする
            renderProducts(); // エラー時も（空の）描画を試みるか、メッセージ表示のみにする
        }
    }

    // --- 商品ボタンを画面に表示 ---
    function renderProducts() {
        console.log("pos-script.js: renderProducts called. Number of products to render:", products.length); // ★デバッグログ
        if (!productListDiv) {
            console.error("pos-script.js: renderProducts - productListDiv is null, cannot render products.");
            return;
        }
        productListDiv.innerHTML = ''; // 商品リストをクリア

        if (products.length === 0) {
            console.log("pos-script.js: renderProducts - No products to display."); // ★デバッグログ
            productListDiv.innerHTML = '<p>表示できる商品がありません。</p>'; // 商品がない場合のメッセージ
            return;
        }

        products.forEach((product, index) => {
            if (!product || typeof product.name === 'undefined' || typeof product.price === 'undefined') {
                console.warn(`pos-script.js: renderProducts - Skipping invalid product data at index ${index}:`, product);
                return; // 不正なデータはスキップ
            }
            const button = document.createElement('button');
            button.textContent = `${product.name} (${product.price}円)`;
            button.dataset.productId = product.id;
            button.addEventListener('click', () => addToCart(product));
            productListDiv.appendChild(button);
            console.log(`pos-script.js: renderProducts - Appended button for product: ${product.name}`); // ★デバッグログ
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
    // --- キーパッドの生成 ---
    function generateKeypad() {
        if (!keypadContainer) return;
        keypadContainer.innerHTML = ''; // クリア
        const keys = [
            '7', '8', '9',
            '4', '5', '6',
            '1', '2', '3',
            'C', '0', 'BS' // C: クリア, BS: バックスペース
        ];
        keys.forEach(key => {
            const button = document.createElement('button');
            button.textContent = key;
            button.type = 'button'; // form内でのsubmitを防ぐ
            if (key === 'C') {
                button.classList.add('keypad-clear');
                button.addEventListener('click', () => {
                    if(modalAmountReceivedInput) modalAmountReceivedInput.value = '0';
                    calculateModalChange();
                });
            } else if (key === 'BS') {
                button.classList.add('keypad-bs');
                button.addEventListener('click', () => {
                    if(modalAmountReceivedInput) {
                        modalAmountReceivedInput.value = modalAmountReceivedInput.value.slice(0, -1) || '0';
                    }
                    calculateModalChange();
                });
            } else { // 数字キー
                button.addEventListener('click', () => {
                    if(modalAmountReceivedInput) {
                        if (modalAmountReceivedInput.value === '0') {
                            modalAmountReceivedInput.value = key;
                        } else {
                            modalAmountReceivedInput.value += key;
                        }
                    }
                    calculateModalChange();
                });
            }
            keypadContainer.appendChild(button);
        });
    }

    // --- モーダル内のお釣り/不足額計算 ---
    function calculateModalChange() {
        if (!modalTotalAmountSpan || !modalAmountReceivedInput || !modalChangeDisplayP || !modalChangeAmountSpan) return;

        const totalAmount = parseFloat(modalTotalAmountSpan.textContent) || 0;
        const amountReceived = parseFloat(modalAmountReceivedInput.value) || 0;
        let changeOrShortage = amountReceived - totalAmount;

        modalChangeDisplayP.classList.remove('不足'); // 不足クラスを一旦削除

        if (amountReceived >= totalAmount) {
            modalChangeDisplayP.innerHTML = `お釣り: <span id="modal-change-amount">${changeOrShortage}</span> 円`;
        } else {
            modalChangeDisplayP.innerHTML = `不足額: <span id="modal-change-amount">${Math.abs(changeOrShortage)}</span> 円`;
            modalChangeDisplayP.classList.add('不足');
        }
        // modalChangeAmountSpan は再生成されるので、再度取得するか、innerHTMLで直接値を設定する
        // document.getElementById('modal-change-amount').textContent = ... でも良いが、上記で一括設定
    }

    // --- 「会計する」ボタンでモーダルを開く ---
    checkoutButton?.addEventListener('click', () => {
        if (cart.length === 0) { alert("カートが空です。"); return; }
        if (!paymentConfirmModal || !modalTotalAmountSpan || !modalAmountReceivedInput || !modalChangeDisplayP) {
            console.error("Checkout button: One or more payment modal elements are missing.");
            return;
        }
        const total = parseFloat(totalAmountSpan.textContent) || 0;
        modalTotalAmountSpan.textContent = total;
        modalAmountReceivedInput.value = '0'; // 初期値は0
        calculateModalChange(); // 初期お釣り表示
        generateKeypad(); // キーパッド生成
        paymentConfirmModal.classList.remove('hidden');
    });
        // --- 整理番号操作モーダルを閉じる処理 ---
    function closeTicketOptionsModal() {
        if (!ticketOptionsModal || !ticketNumberInput) return;
        ticketOptionsModal.classList.add('hidden');
        currentOperatingTicket = null;
        ticketNumberInput.value = '';
    }
    closeModalButtonForTicketOptions?.addEventListener('click', closeTicketOptionsModal);
    modalOptionBackButton?.addEventListener('click', closeTicketOptionsModal);
    window.addEventListener('click', (event) => {
        if (event.target == ticketOptionsModal) {
            closeTicketOptionsModal();
        }
    });
        // --- 会計確認モーダルを閉じる ---
    function closePaymentConfirmModal() {
        if(paymentConfirmModal) paymentConfirmModal.classList.add('hidden');
    }
    closePaymentModalButtonForPayment?.addEventListener('click', closePaymentConfirmModal);
    cancelPaymentButton?.addEventListener('click', closePaymentConfirmModal);
    window.addEventListener('click', (event) => { // モーダル外クリック (会計確認モーダル用)
        if (event.target == paymentConfirmModal) {
            closePaymentConfirmModal();
        }
    });

    // 「支払いを確定する」ボタンの処理 (★エラー箇所★)
    // confirmPaymentButton が null でないことを確認してからイベントリスナーを登録
    if (confirmPaymentButton) {
        confirmPaymentButton.addEventListener('click', async () => {
            console.log("Confirm payment button clicked."); // ★デバッグログ

            // 関数スコープ内で再度要素の存在を確認 (VSCodeの指摘とエラー回避のため)
            if (!modalTotalAmountSpan || !modalAmountReceivedInput) {
                console.error("Confirm Payment Event: modalTotalAmountSpan or modalAmountReceivedInput is null inside event listener. This should not happen if elements were found initially.");
                alert("会計処理に必要な要素が見つかりません。");
                return;
            }

            const totalAmount = parseFloat(modalTotalAmountSpan.textContent) || 0;
            const amountReceived = parseFloat(modalAmountReceivedInput.value) || 0;
            const changeOrShortage = amountReceived - totalAmount;

            if (amountReceived < totalAmount) {
                alert("お預かり金額が合計金額に足りていません。");
                return;
            }

            closePaymentConfirmModal();

            let newTicketNumber;
            try {
                console.log("Confirm Payment: Checkout process starting in confirmPaymentButton event...");
                newTicketNumber = await db.runTransaction(async (transaction) => {
                    const queueDoc = await transaction.get(queueStatusRef);
                    let data = queueDoc.data() || {};
                    if (!queueDoc.exists) { data = { lastIssuedTicket: 0, servingTicket: 0, waitingCount: 0, makingTickets: [], readyTickets: [] }; }
                    const currentLastTicket = data.lastIssuedTicket || 0;
                    const newLastTicket = currentLastTicket + 1;
                    const newMakingTickets = [...(data.makingTickets || []), newLastTicket];
                    const updateData = {
                        lastIssuedTicket: newLastTicket,
                        waitingCount: firebase.firestore.FieldValue.increment(1),
                        makingTickets: newMakingTickets
                    };
                    if (typeof data.readyTickets === 'undefined') updateData.readyTickets = [];
                    if (typeof data.servingTicket === 'undefined') updateData.servingTicket = 0;
                    if (!queueDoc.exists) { transaction.set(queueStatusRef, updateData); }
                    else { transaction.update(queueStatusRef, updateData); }
                    return newLastTicket;
                });
                console.log("Confirm Payment: New ticket number issued:", newTicketNumber);

                await db.collection('sales').add({
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    items: cart.map(item => ({ productId: item.id, name: item.name, price: item.price, quantity: item.quantity })),
                    totalAmount: totalAmount,
                    paymentMethod: "cash",
                    ticketNumber: newTicketNumber,
                    status: "completed",
                    amountReceived: amountReceived,
                    changeGiven: changeOrShortage
                });
                console.log("Confirm Payment: Sales data added for ticket:", newTicketNumber);

                if (cart.length > 0 && newTicketNumber) {
                    const kitchenOrderItems = cart.map(item => ({ productId: item.id, name: item.name, quantity: item.quantity }));
                    await addOrderToKitchenQueue(newTicketNumber, kitchenOrderItems);
                }

                alert(`会計完了。\n整理番号: ${newTicketNumber}\n合計: ${totalAmount}円\nお預かり: ${amountReceived}円\nお釣り: ${changeOrShortage}円`);
                cart = [];
                renderCart();
            } catch (error) {
                console.error("Confirm Payment: Error during checkout in confirmPaymentButton event: ", error);
                alert("会計処理中にエラーが発生しました。");
            }
        });
    } else {
        // このログは DOMContentLoaded の直後にも出力しているので、ここでは不要かもしれないが、念のため
        console.error("pos-script.js: ERROR - confirmPaymentButton was not found, so its event listener was NOT attached.");
    } // clearCartButton の処理では、カートと合計金額表示のリセットのみでOK
    clearCartButton?.addEventListener('click', () => {
        cart = [];
        renderCart(); // 合計金額表示が0になる
        // お預かり・お釣りの表示はモーダル外では不要になった
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
    closeModalButtonForTicketOptions?.addEventListener('click', closeModalButtonForTicketOptions); // closeModal_TicketOptions を使う
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
        console.log("pos-script.js: initializePos called.");
        if (typeof firebase === 'undefined' || typeof db === 'undefined') {
            console.error("pos-script.js: initializePos - Firebase or DB not initialized.");
            return;
        }
        await fetchProducts();
        const doc = await queueStatusRef.get();
        if (!doc.exists) {
            try {
                await queueStatusRef.set({
                    lastIssuedTicket: 0, servingTicket: 0, waitingCount: 0,
                    makingTickets: [], readyTickets: [],
                }, { merge: true }); // merge:trueでフィールドがなくてもエラーにならないように
                console.log("Initialized queue status with all fields.");
            } catch (e) { console.error("Error initializing queue status:", e); }
        } else {
             const data = doc.data();
             const updates = {};
             if (typeof data.makingTickets === 'undefined') updates.makingTickets = [];
             if (typeof data.readyTickets === 'undefined') updates.readyTickets = [];
             if (typeof data.waitingCount === 'undefined') updates.waitingCount = 0; // waitingCountも確認
             if (typeof data.servingTicket === 'undefined') updates.servingTicket = 0; // servingTicketも確認
             if (typeof data.lastIssuedTicket === 'undefined') updates.lastIssuedTicket = 0; // lastIssuedTicketも確認

             if (Object.keys(updates).length > 0) {
                 console.log("Updating existing queue document with new fields:", updates);
                 await queueStatusRef.update(updates).catch(e => console.error("Error updating queue with new fields:", e));
             }
        }
    }
    // ★★★ initializePosの呼び出しを確認 ★★★
    if (document.readyState === 'loading') { // DOMがまだ読み込み中の場合
        document.addEventListener('DOMContentLoaded', initializePos);
        console.log("pos-script.js: Added DOMContentLoaded listener for initializePos.");
    } else { // DOMが既に読み込み完了している場合
        console.log("pos-script.js: DOM already loaded, calling initializePos directly.");
        initializePos();
    }
});