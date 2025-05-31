document.addEventListener('DOMContentLoaded', () => {
    const productListDiv = document.getElementById('product-list');
    const cartItemsUl = document.getElementById('cart-items');
    const totalAmountSpan = document.getElementById('total-amount');
    const checkoutButton = document.getElementById('checkout-button');
    const clearCartButton = document.getElementById('clear-cart-button');
    const nextCustomerButton = document.getElementById('next-customer-button');
    const servingTicketAdminSpan = document.getElementById('serving-ticket-admin');

    let cart = []; // カート内の商品 { id, name, price, quantity }
    let products = []; // Firestoreから取得した商品リスト { id, name, price }

    // --- Firestoreから商品データを読み込む ---
    async function fetchProducts() {
        try {
            const snapshot = await db.collection('products').orderBy('order', 'asc').get(); // 'order'フィールドでソート
            products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderProducts();
        } catch (error) {
            console.error("Error fetching products: ", error);
            alert("商品データの読み込みに失敗しました。");
        }
    }

    // --- 商品ボタンを画面に表示 ---
    function renderProducts() {
        productListDiv.innerHTML = ''; // 商品リストをクリア
        products.forEach(product => {
            const button = document.createElement('button');
            button.textContent = `${product.name} (${product.price}円)`;
            button.dataset.productId = product.id;
            button.addEventListener('click', () => addToCart(product));
            productListDiv.appendChild(button);
        });
    }

    // --- カートに商品を追加 ---
    function addToCart(product) {
        const existingItem = cart.find(item => item.id === product.id);
        if (existingItem) {
            existingItem.quantity++;
        } else {
            cart.push({ ...product, quantity: 1 });
        }
        renderCart();
    }

    // --- カートの表示を更新 ---
    function renderCart() {
        cartItemsUl.innerHTML = ''; // カート表示をクリア
        let total = 0;
        cart.forEach(item => {
            const li = document.createElement('li');
            li.textContent = `${item.name} x ${item.quantity} - ${item.price * item.quantity}円`;
            // 削除ボタンなどもここに追加できる
            cartItemsUl.appendChild(li);
            total += item.price * item.quantity;
        });
        totalAmountSpan.textContent = total;
    }

    // --- カートをクリア ---
    clearCartButton.addEventListener('click', () => {
        cart = [];
        renderCart();
    });

    // --- 会計処理 ---
    checkoutButton.addEventListener('click', async () => {
        if (cart.length === 0) {
            alert("カートが空です。");
            return;
        }

        const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

        try {
            // 1. 整理券番号を発行 (queue/currentStatusのlastIssuedTicketをインクリメント)
            const queueStatusRef = db.collection('queue').doc('currentStatus');
            const newTicketNumber = await db.runTransaction(async (transaction) => {
                const queueDoc = await transaction.get(queueStatusRef);
                if (!queueDoc.exists) {
                    // ドキュメントがなければ初期化
                    transaction.set(queueStatusRef, { lastIssuedTicket: 1, servingTicket: 0, waitingCount: 1 });
                    return 1;
                }
                const currentLastTicket = queueDoc.data().lastIssuedTicket || 0;
                const newLastTicket = currentLastTicket + 1;
                const currentWaitingCount = queueDoc.data().waitingCount || 0;
                transaction.update(queueStatusRef, { 
                    lastIssuedTicket: newLastTicket,
                    waitingCount: firebase.firestore.FieldValue.increment(1) // 待ち人数を1増やす
                });
                return newLastTicket;
            });

            // 2. salesコレクションに購入データを保存
            await db.collection('sales').add({
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                items: cart.map(item => ({
                    productId: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity
                })),
                totalAmount: totalAmount,
                paymentMethod: "cash",
                ticketNumber: newTicketNumber
            });

            alert(`会計が完了しました。\n整理番号: ${newTicketNumber}\n合計金額: ${totalAmount}円`);
            cart = []; // カートをクリア
            renderCart();

        } catch (error) {
            console.error("Error during checkout: ", error);
            alert("会計処理中にエラーが発生しました。");
        }
    });

    // --- 呼び出し番号の管理 ---
    const queueStatusRef = db.collection('queue').doc('currentStatus');

    // 現在の呼び出し番号を監視して表示
    queueStatusRef.onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            servingTicketAdminSpan.textContent = data.servingTicket || 0;
        } else {
            servingTicketAdminSpan.textContent = 'N/A';
             // 初期データがない場合、作成を促すか、自動作成
            db.collection('queue').doc('currentStatus').set({
                lastIssuedTicket: 0,
                servingTicket: 0,
                waitingCount: 0
            }).then(() => console.log("Queue status initialized."))
              .catch(e => console.error("Error initializing queue status", e));
        }
    });
    
    // 「次の番号へ」ボタンの処理
    nextCustomerButton.addEventListener('click', async () => {
        try {
            await db.runTransaction(async (transaction) => {
                const queueDoc = await transaction.get(queueStatusRef);
                if (!queueDoc.exists) {
                    throw "Queue status document does not exist!";
                }
                const data = queueDoc.data();
                const currentServing = data.servingTicket || 0;
                const lastIssued = data.lastIssuedTicket || 0;
                
                if (currentServing < lastIssued) {
                    const newServingTicket = currentServing + 1;
                    transaction.update(queueStatusRef, { 
                        servingTicket: newServingTicket,
                        waitingCount: firebase.firestore.FieldValue.increment(-1) // 待ち人数を1減らす
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


    // 初期化処理
    async function initialize() {
        await fetchProducts();
        // queue/currentStatus ドキュメントがなければ作成
        const doc = await queueStatusRef.get();
        if (!doc.exists) {
            await queueStatusRef.set({ lastIssuedTicket: 0, servingTicket: 0, waitingCount: 0 });
            console.log("Initialized queue status.");
        }
    }
// ... (既存のコード) ...

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

let currentFoundSaleId = null; // 検索で見つかった取引のIDを保持

// 最新の会計を取り消す機能 (会計直後の対応を想定)
cancelLatestTransactionButton.addEventListener('click', async () => {
    if (!confirm("最新の会計を取り消しますか？整理券が無効になり、待ち人数が調整されます。")) {
        return;
    }
    try {
        // 最新の会計データを取得 (ticketNumberが最も大きいもの、またはtimestampで降順ソートしてlimit(1))
        const salesRef = db.collection('sales').orderBy('timestamp', 'desc').limit(1);
        const snapshot = await salesRef.get();

        if (snapshot.empty) {
            alert("取消対象の取引が見つかりません。");
            return;
        }
        const latestSaleDoc = snapshot.docs[0];
        const latestSaleData = latestSaleDoc.data();

        if (latestSaleData.status === "cancelled" || latestSaleData.status === "refunded") {
            alert("この取引は既に取り消しまたは返品済みです。");
            return;
        }

        // salesドキュメントを更新
        await db.collection('sales').doc(latestSaleDoc.id).update({
            status: "cancelled",
            modifiedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // queueのwaitingCountを減らす
        const queueStatusRef = db.collection('queue').doc('currentStatus');
        await db.runTransaction(async (transaction) => {
            const queueDoc = await transaction.get(queueStatusRef);
            if (queueDoc.exists && (queueDoc.data().waitingCount || 0) > 0) {
                transaction.update(queueStatusRef, {
                    waitingCount: firebase.firestore.FieldValue.increment(-1)
                });
            }
        });

        alert(`整理番号 ${latestSaleData.ticketNumber} の取引を取り消しました。待ち人数を調整しました。`);
        transactionDetailsDiv.style.display = 'none'; // 詳細表示を隠す

    } catch (error) {
        console.error("Error cancelling latest transaction: ", error);
        alert("最新取引の取消中にエラーが発生しました。");
    }
});


searchTransactionButton.addEventListener('click', async () => {
    const ticketNumberToSearch = parseInt(searchTicketNumberInput.value);
    if (isNaN(ticketNumberToSearch)) {
        alert("有効な整理番号を入力してください。");
        return;
    }

    try {
        const salesRef = db.collection('sales').where("ticketNumber", "==", ticketNumberToSearch);
        const snapshot = await salesRef.get();

        if (snapshot.empty) {
            alert("該当する取引が見つかりません。");
            transactionDetailsDiv.style.display = 'none';
            currentFoundSaleId = null;
            return;
        }

        // 通常、ticketNumberはユニークなはずだが、念のため最初のものを取る
        const saleDoc = snapshot.docs[0];
        currentFoundSaleId = saleDoc.id;
        const saleData = saleDoc.data();

        detailTicketNumberSpan.textContent = saleData.ticketNumber;
        detailTimestampSpan.textContent = saleData.timestamp ? new Date(saleData.timestamp.seconds * 1000).toLocaleString() : 'N/A';
        detailTotalAmountSpan.textContent = saleData.totalAmount;
        detailStatusSpan.textContent = saleData.status || "completed"; // statusがなければcompleted扱い

        detailItemsUl.innerHTML = '';
        saleData.items.forEach(item => {
            const li = document.createElement('li');
            li.textContent = `${item.name} x ${item.quantity} (${item.price * item.quantity}円)`;
            detailItemsUl.appendChild(li);
        });

        transactionDetailsDiv.style.display = 'block';
        if (saleData.status !== "completed") {
            refundTransactionButton.style.display = 'none'; // 既に処理済みなら返品ボタン非表示
            alert(`この取引は既に「${saleData.status}」です。`);
        } else {
            refundTransactionButton.style.display = 'inline-block';
        }

    } catch (error) {
        console.error("Error searching transaction: ", error);
        alert("取引の検索中にエラーが発生しました。");
        transactionDetailsDiv.style.display = 'none';
        currentFoundSaleId = null;
    }
});

refundTransactionButton.addEventListener('click', async () => {
    if (!currentFoundSaleId) {
        alert("返品対象の取引が選択されていません。");
        return;
    }
    if (!confirm("この取引を返品処理しますか？")) {
        return;
    }

    try {
        await db.collection('sales').doc(currentFoundSaleId).update({
            status: "refunded",
            modifiedAt: firebase.firestore.FieldValue.serverTimestamp()
            // 必要なら notes: "顧客都合による返品" なども追加
        });
        alert("取引を返品済みに更新しました。");
        // UI更新
        detailStatusSpan.textContent = "refunded";
        refundTransactionButton.style.display = 'none';
        currentFoundSaleId = null; // 処理後はクリア
        searchTicketNumberInput.value = ''; // 入力フィールドもクリア

    } catch (error) {
        console.error("Error refunding transaction: ", error);
        alert("返品処理中にエラーが発生しました。");
    }
});
    initialize();
});