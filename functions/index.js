// 最新のv2 SDKのモジュールをインポートします
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");

// アプリを初期化
initializeApp();

/**
 * ordersコレクションに新しいドキュメントが作成されたときにトリガーされる関数
 */
exports.aggregateSalesOnOrderCreate = onDocumentCreated({
  document: "orders/{orderId}", // 監視するドキュメントのパス
  region: "asia-northeast1",   // 関数の実行リージョン
}, async (event) => {
  // イベントデータからドキュメントのスナップショットを取得
  const snap = event.data;
  if (!snap) {
    logger.log("No data associated with the event");
    return;
  }
  const orderData = snap.data();

  try {
    const db = getFirestore();

    // 1. 設定からPayPay手数料率を取得
    const settingsSnap = await db.collection("settings").doc("config").get();
    const paypayFeePercentage = settingsSnap.data().paypayFeePercentage || 0;

    // 2. 注文内容から原価を計算
    let totalCost = 0;
    if (orderData.items && Array.isArray(orderData.items)) {
      orderData.items.forEach((item) => {
        totalCost += (item.cost || 0) * item.quantity;
      });
    }

    // 3. PayPay決済の場合、手数料を原価に加算
    if (orderData.paymentMethod === "paypay") {
      const fee = orderData.totalAmount * (paypayFeePercentage / 100.0);
      totalCost += fee;
    }

    const totalSales = orderData.totalAmount;
    const totalProfit = totalSales - totalCost;

    // 4. 日本時間の日付と時間を取得
    const jstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const yyyy = jstDate.getUTCFullYear();
    const mm = String(jstDate.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(jstDate.getUTCDate()).padStart(2, "0");
    const hour = String(jstDate.getUTCHours()).padStart(2, "0");
    const dateId = `${yyyy}-${mm}-${dd}`;

    const summaryRef = db.collection("salesSummaries").doc(dateId);

    // 5. トランザクションを使って安全に集計データを更新
    await db.runTransaction(async (transaction) => {
      const summaryDoc = await transaction.get(summaryRef);

      let currentData;
      if (!summaryDoc.exists) {
        currentData = {
          date: dateId,
          totalSales: 0, totalProfit: 0,
          cashSales: 0, cashProfit: 0,
          paypaySales: 0, paypayProfit: 0,
          hourly: {},
        };
      } else {
        currentData = summaryDoc.data();
      }

      currentData.totalSales += totalSales;
      currentData.totalProfit += totalProfit;

      if (!currentData.hourly[hour]) {
        currentData.hourly[hour] = {sales: 0, profit: 0, cashSales: 0, cashProfit: 0, paypaySales: 0, paypayProfit: 0};
      }
      currentData.hourly[hour].sales += totalSales;
      currentData.hourly[hour].profit += totalProfit;

      if (orderData.paymentMethod === "cash") {
        currentData.cashSales += totalSales;
        currentData.cashProfit += totalProfit;
        currentData.hourly[hour].cashSales += totalSales;
        currentData.hourly[hour].cashProfit += totalProfit;
      } else if (orderData.paymentMethod === "paypay") {
        currentData.paypaySales += totalSales;
        currentData.paypayProfit += totalProfit;
        currentData.hourly[hour].paypaySales += totalSales;
        currentData.hourly[hour].paypayProfit += totalProfit;
      }
      transaction.set(summaryRef, currentData);
    });

    logger.info(`Successfully aggregated sales for order: ${snap.id}`, {structuredData: true});

  } catch (error) {
    logger.error(`Error aggregating sales for order: ${snap.id}`, error, {structuredData: true});
  }
});