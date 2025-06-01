document.addEventListener('DOMContentLoaded', () => {
    const auth = firebase.auth();
    const db = firebase.firestore();

    const loginContainer = document.getElementById('login-container');
    const dashboardContent = document.getElementById('dashboard-content');
    const loginButton = document.getElementById('login-button');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginErrorDiv = document.getElementById('login-error');
    const logoutButton = document.getElementById('logout-button');

    // --- 認証状態の監視 ---
    auth.onAuthStateChanged(user => {
        if (user) {
            // ユーザーがログインしている場合
            console.log("User logged in:", user.email);
            loginContainer.classList.add('hidden'); // ログインフォームを隠す
            dashboardContent.style.display = 'block'; // ★★★ ダッシュボードを表示 (CSSでnoneにしているのでblockで表示)
            dashboardContent.classList.remove('hidden'); // hiddenクラスも念のため削除

            initializeDashboard(); // ダッシュボードのコンテンツを初期化・描画
        } else {
            // ユーザーがログアウトしている、または未ログインの場合
            console.log("User logged out or not logged in.");
            loginContainer.classList.remove('hidden'); // ログインフォームを表示
            loginContainer.style.display = 'block'; // 表示を確実にする
            dashboardContent.style.display = 'none';   // ★★★ ダッシュボードを隠す
            dashboardContent.classList.add('hidden');  // hiddenクラスも念のため追加

            // ログイン画面でエラーメッセージが残っていればクリア
            if(loginErrorDiv) loginErrorDiv.textContent = '';
            if(emailInput) emailInput.value = '';
            if(passwordInput) passwordInput.value = '';


            // グラフインスタンスがあれば破棄 (ログアウト時)
            if (salesByProductChartInstance) {
                salesByProductChartInstance.destroy();
                salesByProductChartInstance = null;
            }
            if (salesOverTimeChartInstance) {
                salesOverTimeChartInstance.destroy();
                salesOverTimeChartInstance = null;
            }
        }
    });

    // --- ログイン処理 ---
    loginButton.addEventListener('click', () => {
        // ... (既存のログイン処理) ...
        const email = emailInput.value;
        const password = passwordInput.value;
        loginErrorDiv.textContent = '';

        auth.signInWithEmailAndPassword(email, password)
            .then(userCredential => {
                // ログイン成功時の処理は onAuthStateChanged に任せる
            })
            .catch(error => {
                console.error("Login failed:", error);
                loginErrorDiv.textContent = "メールアドレスまたはパスワードが正しくありません。";
            });
    });

    // --- ログアウト処理 ---
    logoutButton.addEventListener('click', () => {
        auth.signOut().then(() => {
            // ログアウト成功時の処理は onAuthStateChanged に任せる
        }).catch(error => {
            console.error("Logout failed:", error);
        });
    });

    // ... (fetchDataAndRenderCharts, renderSalesByProductChart, renderSalesOverTimeChart, displayQueueStatus, initializeDashboard などは変更なし) ...
    // ただし、initializeDashboardはログイン成功時に呼び出されるようにする

    // --- UI制御: 期間セレクタ ---
    timeRangeSelector.addEventListener('change', () => {
        const customRangePicker = document.getElementById('custom-range-picker'); // 再取得
        if (timeRangeSelector.value === 'custom_range') {
            customRangePicker.classList.remove('hidden'); // hiddenクラスを削除して表示
            dateSelector.value = ''; // 日付指定をクリア
        } else {
            customRangePicker.classList.add('hidden'); // hiddenクラスを追加して非表示
            if (timeRangeSelector.value !== 'today' && timeRangeSelector.value !== 'last_3_hours') {
                 dateSelector.value = ''; // リアルタイム系以外は日付指定をクリア
            }
        }
        if (timeRangeSelector.value === 'today') {
            const today = new Date().toISOString().split('T')[0];
            dateSelector.value = today; // 本日を選択したら日付セレクタも今日に
        }
    });
    dateSelector.addEventListener('change', () => {
        if (dateSelector.value) {
            timeRangeSelector.value = 'all_time'; // 日付指定したら期間は一旦all_timeに戻す (UI的な挙動)
                                               // または "custom_range" にして、開始日・終了日をdateSelectorの値に合わせるなども可
            customRangePicker.classList.add('hidden');
        }
    });


    // --- データの取得と整形 (期間指定対応) ---
    async function fetchDataAndRenderCharts() {
        try {
            let query = db.collection('sales').orderBy('timestamp', 'desc'); // 基本は降順
            const selectedDate = dateSelector.value;
            const selectedRangeOption = timeRangeSelector.value;

            let startTime = null;
            let endTime = null;
            const now = new Date();

            if (selectedDate) { // 日付指定が優先
                startTime = new Date(selectedDate);
                startTime.setHours(0, 0, 0, 0); // 指定日の00:00:00
                endTime = new Date(selectedDate);
                endTime.setHours(23, 59, 59, 999); // 指定日の23:59:59
            } else { // 日付指定がない場合は期間セレクタを見る
                switch (selectedRangeOption) {
                    case 'today':
                        startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                        endTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
                        break;
                    case 'last_3_hours':
                        startTime = new Date(now.getTime() - 3 * 60 * 60 * 1000);
                        endTime = now; // 現在時刻まで
                        break;
                    case 'custom_range':
                        if (startDateInput.value) {
                            startTime = new Date(startDateInput.value);
                            startTime.setHours(0,0,0,0);
                        }
                        if (endDateInput.value) {
                            endTime = new Date(endDateInput.value);
                            endTime.setHours(23,59,59,999);
                        }
                        if (startTime && endTime && startTime > endTime) {
                            alert("開始日は終了日より前に設定してください。");
                            return;
                        }
                        break;
                    case 'all_time':
                    default:
                        // startTime, endTime は null のまま (全期間)
                        break;
                }
            }

            // Firestoreクエリの構築
            if (startTime) {
                query = query.where('timestamp', '>=', startTime);
            }
            if (endTime) {
                // Firestoreの降順ソートと範囲クエリの組み合わせでは、
                // where('timestamp', '<=', endTime) と orderBy('timestamp', 'desc') を使う場合、
                // 先に endTime でフィルタリングし、その後クライアント側で startTime を考慮するか、
                // または orderBy('timestamp', 'asc') にして where で両端を指定する。
                // ここでは簡便のため、descのまま < endTime でフィルタし、クライアント側でさらに絞るか、
                // もしくはFirestoreのクエリの制約を考慮して昇順にする。
                // 今回は一旦 < endTime で取得し、クライアント側でフィルタはしない。
                // より正確には orderBy('timestamp', 'asc') で where >= startTime and where <= endTime が良い
                query = query.where('timestamp', '<=', endTime);
            }
            // 注意: Firestoreでは複数の範囲フィルタを異なるフィールドに適用できません。
            // timestamp に対する >= と <= はOKです。

            const snapshot = await query.get();
            const salesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            renderSalesByProductChart(salesData);
            // 3時間ごとの集計は、取得した salesData と選択された期間(startTime, endTime)を渡す
            renderSalesOverTimeChart(salesData, startTime, endTime);

        } catch (error) {
            console.error("Error fetching sales data: ", error);
            alert("売上データの読み込みに失敗しました。");
        }
    }


    // --- 時間帯別 総売上・総返品 推移グラフ (3時間ごと集計) ---
    function renderSalesOverTimeChart(salesData, overallStartTime, overallEndTime) {
        if (!salesOverTimeCtx) return;

        const salesByTimeSlot = {}; // { 'YYYY-MM-DD HH(slot start)': { salesAmount, refundAmount } }
        const slotHours = 3; // 3時間ごとのスロット

        // 表示する全体の期間を決定
        let chartStartTime, chartEndTime;
        if (overallStartTime && overallEndTime) {
            chartStartTime = new Date(overallStartTime);
            chartEndTime = new Date(overallEndTime);
        } else if (salesData.length > 0) {
            // 全期間の場合、データの一番古いものと新しいものから期間を設定
            const timestamps = salesData.map(s => s.timestamp.toDate().getTime());
            chartStartTime = new Date(Math.min(...timestamps));
            chartEndTime = new Date(Math.max(...timestamps));
        } else {
            // データがない場合はデフォルトの期間（例: 今日）
            chartStartTime = new Date();
            chartStartTime.setHours(0,0,0,0);
            chartEndTime = new Date();
            chartEndTime.setHours(23,59,59,999);
        }
         // chartStartTime の時を slotHours の倍数に丸める (切り捨て)
        chartStartTime.setHours(Math.floor(chartStartTime.getHours() / slotHours) * slotHours, 0, 0, 0);


        // 3時間ごとのラベルを生成
        const labels = [];
        let currentSlotStart = new Date(chartStartTime);
        while (currentSlotStart <= chartEndTime) {
            const year = currentSlotStart.getFullYear();
            const month = String(currentSlotStart.getMonth() + 1).padStart(2, '0');
            const day = String(currentSlotStart.getDate()).padStart(2, '0');
            const hour = String(currentSlotStart.getHours()).padStart(2, '0');
            const slotKey = `${year}-${month}-${day} ${hour}:00`;
            labels.push(slotKey);
            salesByTimeSlot[slotKey] = { salesAmount: 0, refundAmount: 0, salesCount: 0, refundCount: 0 };
            currentSlotStart.setHours(currentSlotStart.getHours() + slotHours);
        }
        // 最後のスロットが endTime を超えないように調整（必要なら）
        if (labels.length > 0 && new Date(labels[labels.length - 1]) > chartEndTime && labels.length > 1) {
           // labels.pop(); // 最後のラベルが範囲外なら削除 (ケースバイケース)
        }


        salesData.forEach(sale => {
            if (!sale.timestamp || !sale.timestamp.toDate) return;
            const saleTime = sale.timestamp.toDate();

            // どの3時間スロットに属するかを決定
            const saleHour = saleTime.getHours();
            const slotStartHour = Math.floor(saleHour / slotHours) * slotHours;
            
            const slotKeyDate = new Date(saleTime);
            slotKeyDate.setHours(slotStartHour, 0, 0, 0); // 分、秒、ミリ秒をリセット

            const year = slotKeyDate.getFullYear();
            const month = String(slotKeyDate.getMonth() + 1).padStart(2, '0');
            const day = String(slotKeyDate.getDate()).padStart(2, '0');
            const hourStr = String(slotKeyDate.getHours()).padStart(2, '0');
            const slotKey = `${year}-${month}-${day} ${hourStr}:00`;


            if (salesByTimeSlot[slotKey]) {
                let transactionAmount = 0;
                let transactionCount = 0;
                sale.items.forEach(item => {
                    transactionAmount += item.price * item.quantity;
                    transactionCount += item.quantity;
                });

                if (sale.status === 'completed') {
                    salesByTimeSlot[slotKey].salesAmount += transactionAmount;
                    salesByTimeSlot[slotKey].salesCount += transactionCount;
                } else if (sale.status === 'refunded') {
                    salesByTimeSlot[slotKey].refundAmount += transactionAmount;
                    salesByTimeSlot[slotKey].refundCount += transactionCount;
                }
            }
        });
        
        const salesAmounts = labels.map(key => salesByTimeSlot[key] ? salesByTimeSlot[key].salesAmount : 0);
        const refundAmounts = labels.map(key => salesByTimeSlot[key] ? salesByTimeSlot[key].refundAmount : 0);

        if (salesOverTimeChartInstance) {
            salesOverTimeChartInstance.destroy();
        }
        salesOverTimeChartInstance = new Chart(salesOverTimeCtx, {
            type: 'bar', // 棒グラフの方が見やすいかも
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '総売上金額 (円)',
                        data: salesAmounts,
                        backgroundColor: 'rgba(54, 162, 235, 0.7)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    },
                    {
                        label: '総返品金額 (円)',
                        data: refundAmounts,
                        backgroundColor: 'rgba(255, 159, 64, 0.7)',
                        borderColor: 'rgba(255, 159, 64, 1)',
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
                        title: { display: true, text: '時間帯 (3時間ごと)' },
                        // type: 'time', // date-fnsアダプタを使う場合
                        // time: {
                        //     unit: 'hour',
                        //     stepSize: 3,
                        //     displayFormats: {
                        //         hour: 'MM/dd HH:mm'
                        //     }
                        // }
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

    // 商品別グラフ関数は変更なし (renderSalesByProductChart) ...
    // (前回のコードをそのまま使用)
    function renderSalesByProductChart(salesData) {
        if (!salesByProductCtx) return;

        const productSales = {}; 

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
                    productSales[item.productId].refundAmount += item.price * item.quantity;
                    productSales[item.productId].refundCount += item.quantity;
                }
            });
        });

        const labels = Object.values(productSales).map(p => p.name);
        const salesAmounts = Object.values(productSales).map(p => p.salesAmount);
        const refundAmounts = Object.values(productSales).map(p => p.refundAmount);

        if (salesByProductChartInstance) {
            salesByProductChartInstance.destroy(); 
        }
        salesByProductChartInstance = new Chart(salesByProductCtx, {
            type: 'bar', 
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
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }


    // --- 待ち行列情報の表示 (変更なし) ---
    function displayQueueStatus() {
        // ... (前回のコードと同じ) ...
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


    // --- ダッシュボード初期化 (ログイン後に呼び出される) ---
    function initializeDashboard() {
        if (typeof firebase === 'undefined' || typeof db === 'undefined') {
            console.error("Firebase or DB not initialized.");
            alert("Firebaseの初期化に失敗しました。");
            return;
        }
        const today = new Date().toISOString().split('T')[0];
        const dateSelector = document.getElementById('date-selector'); // 再取得
        const timeRangeSelector = document.getElementById('time-range-selector'); // 再取得

        if(dateSelector) dateSelector.value = today;
        if(timeRangeSelector) timeRangeSelector.value = 'all_time'; // または 'today'

        fetchDataAndRenderCharts(); // グラフなどのデータを取得・描画
        displayQueueStatus();       // 待ち状況を表示
    }

    // イベントリスナー (refreshDataButtonなど)
    const refreshDataButton = document.getElementById('refresh-data-button');
    if(refreshDataButton) { // refreshDataButtonがダッシュボード内にあれば、存在確認をする
        refreshDataButton.addEventListener('click', fetchDataAndRenderCharts);
    }
    // 期間セレクタなどのイベントリスナーも同様に、要素の存在確認をしてから登録
    const dateSelectorElem = document.getElementById('date-selector');
    const timeRangeSelectorElem = document.getElementById('time-range-selector');
    // ... (これらの要素に対するイベントリスナーも、要素が存在する場合のみ設定する方が安全)


    // ページロード時の直接的な initializeDashboard() 呼び出しは削除。
    // onAuthStateChanged が最初の状態を判断し、必要なら呼び出す。
});