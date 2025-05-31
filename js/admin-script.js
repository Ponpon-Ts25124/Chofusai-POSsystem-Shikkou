document.addEventListener('DOMContentLoaded', () => {
    const salesByProductCtx = document.getElementById('salesByProductChart')?.getContext('2d');
    const salesOverTimeCtx = document.getElementById('salesOverTimeChart')?.getContext('2d');
    const timeRangeSelector = document.getElementById('time-range-selector');
    const refreshDataButton = document.getElementById('refresh-data-button');

    const adminServingTicketSpan = document.getElementById('admin-serving-ticket');
    const adminLastIssuedTicketSpan = document.getElementById('admin-last-issued-ticket');
    const adminWaitingCountSpan = document.getElementById('admin-waiting-count');

    let salesByProductChartInstance = null;
    let salesOverTimeChartInstance = null;
    let allSalesData = []; // 全期間の売上データを保持

    // --- データの取得と整形 ---
    async function fetchDataAndRenderCharts() {
        try {
            let query = db.collection('sales').orderBy('timestamp', 'desc');
            const selectedRange = timeRangeSelector.value;
            const now = new Date();
            let startTime = null;

            if (selectedRange === "today") {
                startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // 今日の0時
            } else if (selectedRange === "last_hour") {
                startTime = new Date(now.getTime() - 60 * 60 * 1000); // 1時間前
            } else if (selectedRange === "last_3_hours") {
                startTime = new Date(now.getTime() - 3 * 60 * 60 * 1000); // 3時間前
            }
            // "all_time" の場合は startTime は null のまま

            if (startTime) {
                query = query.where('timestamp', '>=', startTime);
            }

            const snapshot = await query.get();
            allSalesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            renderSalesByProductChart(allSalesData);
            renderSalesOverTimeChart(allSalesData);

        } catch (error) {
            console.error("Error fetching sales data: ", error);
            alert("売上データの読み込みに失敗しました。");
        }
    }

    // --- 商品別売上・返品グラフ ---
    function renderSalesByProductChart(salesData) {
        if (!salesByProductCtx) return;

        const productSales = {}; // { productId: { name, salesAmount, refundAmount, salesCount, refundCount } }

        salesData.forEach(sale => {
            if (!sale.items) return;

            sale.items.forEach(item => {
                if (!productSales[item.productId]) {
                    productSales[item.productId] = {
                        name: item.name,
                        salesAmount: 0,
                        refundAmount: 0,
                        salesCount: 0,
                        refundCount: 0
                    };
                }

                if (sale.status === 'completed') {
                    productSales[item.productId].salesAmount += item.price * item.quantity;
                    productSales[item.productId].salesCount += item.quantity;
                } else if (sale.status === 'refunded') {
                    // 全返品を想定し、購入時のアイテムを返品として計上
                    productSales[item.productId].refundAmount += item.price * item.quantity;
                    productSales[item.productId].refundCount += item.quantity;
                    // もし返品時に売上からも引くなら以下も（二重計上にならないように注意）
                    // productSales[item.productId].salesAmount -= item.price * item.quantity;
                }
                // 'cancelled' は売上にも返品にも計上しない (取引自体が無効)
            });
        });

        const labels = Object.values(productSales).map(p => p.name);
        const salesAmounts = Object.values(productSales).map(p => p.salesAmount);
        const refundAmounts = Object.values(productSales).map(p => p.refundAmount);

        if (salesByProductChartInstance) {
            salesByProductChartInstance.destroy(); // 既存のグラフを破棄
        }
        salesByProductChartInstance = new Chart(salesByProductCtx, {
            type: 'bar', // 積み上げ棒グラフやグループ化棒グラフも検討可
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '売上金額 (円)',
                        data: salesAmounts,
                        backgroundColor: 'rgba(75, 192, 192, 0.7)',
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 1
                    },
                    {
                        label: '返品金額 (円)',
                        data: refundAmounts,
                        backgroundColor: 'rgba(255, 99, 132, 0.7)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: '金額 (円)' }
                    },
                    x: {
                        title: { display: true, text: '商品' }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(context.parsed.y);
                                }
                                // 数量も表示したい場合:
                                // const productName = context.label;
                                // const productData = Object.values(productSales).find(p => p.name === productName);
                                // if (productData) {
                                //    const count = (context.dataset.label.includes('売上') ? productData.salesCount : productData.refundCount);
                                //    label += ` (${count}個)`;
                                // }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    // --- 時間帯別 総売上・総返品 推移グラフ ---
    function renderSalesOverTimeChart(salesData) {
        if (!salesOverTimeCtx) return;

        // データを時間帯ごと（例: 1時間ごと）に集計
        const salesByHour = {}; // { 'YYYY-MM-DD HH': { sales, refunds } }

        salesData.forEach(sale => {
            if (!sale.timestamp || !sale.timestamp.toDate) return; // タイムスタンプがないデータはスキップ
            const saleTime = sale.timestamp.toDate();
            const hourKey = `${saleTime.getFullYear()}-${String(saleTime.getMonth() + 1).padStart(2, '0')}-${String(saleTime.getDate()).padStart(2, '0')} ${String(saleTime.getHours()).padStart(2, '0')}:00`;

            if (!salesByHour[hourKey]) {
                salesByHour[hourKey] = { salesAmount: 0, refundAmount: 0, salesCount: 0, refundCount: 0 };
            }

            let transactionAmount = 0;
            let transactionCount = 0;
            sale.items.forEach(item => {
                transactionAmount += item.price * item.quantity;
                transactionCount += item.quantity;
            });


            if (sale.status === 'completed') {
                salesByHour[hourKey].salesAmount += transactionAmount;
                salesByHour[hourKey].salesCount += transactionCount;
            } else if (sale.status === 'refunded') {
                salesByHour[hourKey].refundAmount += transactionAmount;
                salesByHour[hourKey].refundCount += transactionCount;
            }
        });

        const sortedHourKeys = Object.keys(salesByHour).sort(); // 時間順にソート

        const labels = sortedHourKeys;
        const salesAmounts = sortedHourKeys.map(key => salesByHour[key].salesAmount);
        const refundAmounts = sortedHourKeys.map(key => salesByHour[key].refundAmount);

        if (salesOverTimeChartInstance) {
            salesOverTimeChartInstance.destroy();
        }
        salesOverTimeChartInstance = new Chart(salesOverTimeCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '総売上金額 (円)',
                        data: salesAmounts,
                        borderColor: 'rgba(54, 162, 235, 1)',
                        backgroundColor: 'rgba(54, 162, 235, 0.2)',
                        fill: true,
                        tension: 0.1
                    },
                    {
                        label: '総返品金額 (円)',
                        data: refundAmounts,
                        borderColor: 'rgba(255, 159, 64, 1)',
                        backgroundColor: 'rgba(255, 159, 64, 0.2)',
                        fill: true,
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: '金額 (円)' }
                    },
                    x: {
                        title: { display: true, text: '時間帯' }
                        // type: 'time' を使うとより高度な時間軸表現が可能だが、データ整形が必要
                    }
                },
                plugins: {
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                    }
                }
            }
        });
    }

    // --- 待ち行列情報の表示 ---
    function displayQueueStatus() {
        const queueStatusRef = db.collection('queue').doc('currentStatus');
        queueStatusRef.onSnapshot(doc => {
            if (doc.exists) {
                const data = doc.data();
                adminServingTicketSpan.textContent = data.servingTicket || 0;
                adminLastIssuedTicketSpan.textContent = data.lastIssuedTicket || 0;
                adminWaitingCountSpan.textContent = data.waitingCount || 0;
            } else {
                adminServingTicketSpan.textContent = 'N/A';
                adminLastIssuedTicketSpan.textContent = 'N/A';
                adminWaitingCountSpan.textContent = 'N/A';
            }
        }, err => {
            console.error("Error listening to admin queue status: ", err);
        });
    }


    // --- イベントリスナー ---
    timeRangeSelector.addEventListener('change', fetchDataAndRenderCharts);
    refreshDataButton.addEventListener('click', fetchDataAndRenderCharts);

    // --- 初期化 ---
    async function initializeAdminPage() {
        // Firebaseの初期化は firebase-config.js で行われている前提
        if (typeof firebase === 'undefined' || typeof db === 'undefined') {
            console.error("Firebase is not initialized. Make sure firebase-config.js is loaded and configured correctly.");
            alert("Firebaseの初期化に失敗しました。設定を確認してください。");
            return;
        }
        await fetchDataAndRenderCharts();
        displayQueueStatus(); // 待ち状況も表示
    }

    initializeAdminPage();
});