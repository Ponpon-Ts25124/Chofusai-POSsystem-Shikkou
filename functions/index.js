const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");

initializeApp();

exports.aggregateSalesOnOrderCreate = onDocumentCreated({
  document: "orders/{orderId}",
  region: "asia-northeast1",
}, async (event) => {
  const snap = event.data;
  if (!snap) {
    logger.log("No data associated with the event");
    return;
  }
  const orderData = snap.data();
  const db = getFirestore();

  try {
    // --- 1. 売上集計処理 (既存機能) ---
    const settingsSnap = await db.collection("settings").doc("config").get();
    const paypayFeePercentage = settingsSnap.data().paypayFeePercentage || 0;

    let totalCost = 0;
    if (orderData.items && Array.isArray(orderData.items)) {
      orderData.items.forEach((item) => {
        totalCost += (item.cost || 0) * item.quantity;
      });
    }

    if (orderData.paymentMethod === "paypay") {
      const fee = orderData.totalAmount * (paypayFeePercentage / 100.0);
      totalCost += fee;
    }

    const totalSales = orderData.totalAmount;
    const totalProfit = totalSales - totalCost;

    const jstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const yyyy = jstDate.getUTCFullYear();
    const mm = String(jstDate.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(jstDate.getUTCDate()).padStart(2, "0");
    const hour = String(jstDate.getUTCHours()).padStart(2, "0");
    const dateId = `${yyyy}-${mm}-${dd}`;

    const summaryRef = db.collection("salesSummaries").doc(dateId);
    const batch = db.batch();
    const increment = FieldValue.increment;

    const updateData = {
      date: dateId,
      totalSales: increment(totalSales),
      totalProfit: increment(totalProfit),
    };
    updateData[`hourly.${hour}.sales`] = increment(totalSales);
    updateData[`hourly.${hour}.profit`] = increment(totalProfit);

    if (orderData.paymentMethod === "cash") {
      updateData.cashSales = increment(totalSales);
      updateData.cashProfit = increment(totalProfit);
      updateData[`hourly.${hour}.cashSales`] = increment(totalSales);
      updateData[`hourly.${hour}.cashProfit`] = increment(totalProfit);
    } else if (orderData.paymentMethod === "paypay") {
      updateData.paypaySales = increment(totalSales);
      updateData.paypayProfit = increment(totalProfit);
      updateData[`hourly.${hour}.paypaySales`] = increment(totalSales);
      updateData[`hourly.${hour}.paypayProfit`] = increment(totalProfit);
    }

    batch.set(summaryRef, updateData, { merge: true });

    // --- 2. 商品ごとの販売数カウント & 在庫管理処理 (新規追加) ---
    
    // 在庫IDごとの減少数を集計するためのマップ
    const inventoryDecrements = {}; 

    if (orderData.items && Array.isArray(orderData.items)) {
        for (const item of orderData.items) {
            if (!item.productId) continue;

            const productRef = db.collection('products').doc(item.productId);
            
            // A. 販売数のカウントアップ
            batch.update(productRef, { 
                salesCount: increment(item.quantity) 
            });

            // B. 在庫IDの確認 (productドキュメントを読み込む必要があります)
            const productDoc = await productRef.get();
            const inventoryId = productDoc.data().inventoryId;

            if (inventoryId) {
                if (!inventoryDecrements[inventoryId]) {
                    inventoryDecrements[inventoryId] = 0;
                }
                inventoryDecrements[inventoryId] += item.quantity;
            }
        }
    }

    // 集計と販売数更新のバッチをコミット
    await batch.commit();

    // --- 3. 共有在庫の減算と売り切れ判定 (トランザクションで安全に実行) ---
    if (Object.keys(inventoryDecrements).length > 0) {
        await db.runTransaction(async (transaction) => {
            for (const [invId, quantity] of Object.entries(inventoryDecrements)) {
                const inventoryRef = db.collection('inventory').doc(invId);
                const invDoc = await transaction.get(inventoryRef);

                if (!invDoc.exists) continue;

                const currentStock = invDoc.data().currentStock || 0;
                const newStock = currentStock - quantity;

                // 在庫数を更新
                transaction.update(inventoryRef, { currentStock: newStock });

                // 在庫が0以下になったら、この在庫IDを持つ全商品を「売り切れ」にする
                if (newStock <= 0) {
                    const productsQuery = await db.collection('products').where('inventoryId', '==', invId).get();
                    productsQuery.forEach(doc => {
                        transaction.update(doc.ref, { isSoldOut: true });
                    });
                    logger.info(`Inventory ${invId} is depleted. Marked related products as sold out.`);
                }
            }
        });
    }

    logger.info(`Successfully processed order: ${snap.id}`);

  } catch (error) {
    logger.error(`Error processing order: ${snap.id}`, error);
  }
});