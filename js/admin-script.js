// js/admin-script.js
document.addEventListener('DOMContentLoaded', () => {
    if (typeof auth === 'undefined' || typeof db === 'undefined') {
        console.error("Firebase auth or db is not defined. Check firebase-config.js");
        alert("Firebaseの初期設定エラーです。");
        return;
    }

    const loginContainer = document.getElementById('login-container');
    const dashboardContent = document.getElementById('dashboard-content');
    const loginButton = document.getElementById('login-button');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginErrorDiv = document.getElementById('login-error');
    const logoutButton = document.getElementById('logout-button');

    const dateSelector = document.getElementById('date-selector');
    const timeRangeSelector = document.getElementById('time-range-selector');
    const customRangePicker = document.getElementById('custom-range-picker');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const refreshDataButton = document.getElementById('refresh-data-button');

    const adminServingTicketSpan = document.getElementById('admin-serving-ticket');
    const adminLastIssuedTicketSpan = document.getElementById('admin-last-issued-ticket');
    const adminWaitingCountSpan = document.getElementById('admin-waiting-count');

    // 表示モード関連
    const displayModeSelect = document.getElementById('display-mode-select');
    const saveDisplayModeButton = document.getElementById('save-display-mode-button');
    const queueStatusRefForAdminDisplayMode = db.collection('queue').doc('currentStatus');


    let salesByProductChartInstance = null;
    let salesOverTimeChartInstance = null;

    auth.onAuthStateChanged(user => {
        if (user) {
            if(loginContainer) loginContainer.classList.add('hidden');
            if(dashboardContent) {
                dashboardContent.style.display = 'block';
                dashboardContent.classList.remove('hidden');
            }
            initializeDashboard();
        } else {
            if(loginContainer) {
                loginContainer.style.display = 'block';
                loginContainer.classList.remove('hidden');
            }
            if(dashboardContent) {
                dashboardContent.style.display = 'none';
                dashboardContent.classList.add('hidden');
            }
            if(loginErrorDiv) loginErrorDiv.textContent = '';
            if(emailInput) emailInput.value = '';
            if(passwordInput) passwordInput.value = '';
            if (salesByProductChartInstance) { salesByProductChartInstance.destroy(); salesByProductChartInstance = null; }
            if (salesOverTimeChartInstance) { salesOverTimeChartInstance.destroy(); salesOverTimeChartInstance = null; }
        }
    });

    loginButton?.addEventListener('click', () => {
        if(!emailInput || !passwordInput || !loginErrorDiv) return;
        const email = emailInput.value;
        const password = passwordInput.value;
        loginErrorDiv.textContent = '';
        auth.signInWithEmailAndPassword(email, password)
            .catch(error => {
                console.error("Login failed:", error);
                loginErrorDiv.textContent = "メールアドレスまたはパスワードが正しくありません。";
            });
    });

    logoutButton?.addEventListener('click', () => {
        auth.signOut().catch(error => console.error("Logout failed:", error));
    });

    timeRangeSelector?.addEventListener('change', () => {
        if(!customRangePicker || !dateSelector) return;
        if (timeRangeSelector.value === 'custom_range') {
            customRangePicker.classList.remove('hidden');
            dateSelector.value = '';
        } else {
            customRangePicker.classList.add('hidden');
            if (timeRangeSelector.value !== 'today' && timeRangeSelector.value !== 'last_3_hours') {
                dateSelector.value = '';
            }
        }
        if (timeRangeSelector.value === 'today') {
            const today = new Date().toISOString().split('T')[0];
            dateSelector.value = today;
        }
    });
    dateSelector?.addEventListener('change', () => {
        if(!timeRangeSelector || !customRangePicker) return;
        if (dateSelector.value) {
            timeRangeSelector.value = 'all_time';
            customRangePicker.classList.add('hidden');
        }
    });

    saveDisplayModeButton?.addEventListener('click', async () => {
        if (!displayModeSelect) return;
        const selectedMode = displayModeSelect.value;
        try {
            await queueStatusRefForAdminDisplayMode.update({
                displayMode: selectedMode
            });
            alert(`表示モードを「${selectedMode === "dual" ? "2段階表示" : "通常表示"}」に更新しました。`);
        } catch (error) {
            console.error("Error updating display mode: ", error);
            alert("表示モードの更新に失敗しました。");
        }
    });
    // --- fetchDataAndRenderCharts 関数 ---
    async function fetchDataAndRenderCharts() {
        console.log("fetchDataAndRenderCharts: Initiating data fetch and render..."); // ★デバッグログ
        try {
            let query = db.collection('sales').orderBy('timestamp', 'desc');
            const selectedDate = dateSelector?.value;
            const selectedRangeOption = timeRangeSelector?.value;
            let startTime = null;
            let endTime = null;
            const now = new Date();

            // 期間設定ロジック (変更なし、ただしnullチェックを強化)
            if (selectedDate) {
                startTime = new Date(selectedDate); startTime.setHours(0, 0, 0, 0);
                endTime = new Date(selectedDate); endTime.setHours(23, 59, 59, 999);
            } else if (selectedRangeOption) { // selectedRangeOption が存在する場合のみ switch
                switch (selectedRangeOption) {
                    case 'today':
                        startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                        endTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
                        break;
                    case 'last_3_hours':
                        startTime = new Date(now.getTime() - 3 * 60 * 60 * 1000);
                        endTime = now;
                        break;
                    case 'custom_range':
                        if (startDateInput?.value) { startTime = new Date(startDateInput.value); startTime.setHours(0,0,0,0); }
                        if (endDateInput?.value) { endTime = new Date(endDateInput.value); endTime.setHours(23,59,59,999); }
                        if (startTime && endTime && startTime > endTime) { alert("開始日は終了日より前に設定してください。"); return; }
                        break;
                    default: // all_time または未定義の場合
                        break;
                }
            }
            console.log("fetchDataAndRenderCharts: Time range set - Start:", startTime, "End:", endTime); // ★デバッグログ

            if (startTime) query = query.where('timestamp', '>=', startTime);
            if (endTime) query = query.where('timestamp', '<=', endTime);

            const snapshot = await query.get();
            const salesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log("fetchDataAndRenderCharts: Fetched salesData count:", salesData.length); // ★デバッグログ
            if (salesData.length > 0) console.log("fetchDataAndRenderCharts: First sale data example:", salesData[0]); // ★デバッグログ


            // ★★★ Canvas要素の存在を保証する処理をここで行う ★★★
            prepareCanvasArea('salesByProductChart');
            prepareCanvasArea('salesOverTimeChart');

            if (salesData.length === 0) {
                console.log("fetchDataAndRenderCharts: No sales data found for the period. Clearing charts."); // ★デバッグログ
                clearChartsAndDisplayMessage("期間内に売上データがありません。");
                return; // これ以降のグラフ描画処理をスキップ
            }

            console.log("fetchDataAndRenderCharts: Data found. Rendering charts..."); // ★デバッグログ
            renderSalesByProductChart(salesData); // この関数は前回の完全版を使用
            renderSalesOverTimeChart(salesData, startTime, endTime); // この関数は前回の完全版を使用

        } catch (error) {
            console.error("fetchDataAndRenderCharts: Error during fetch or render: ", error); // ★デバッグログ
            alert("売上データの読み込みまたは表示中にエラーが発生しました。");
            clearChartsAndDisplayMessage(`データの処理に失敗しました: ${error.message}`);
        }
    }

    // --- Canvas要素を準備する関数 ---
    function prepareCanvasArea(canvasId) {
        const chartContainer = document.getElementById(canvasId)?.parentElement; // .chart-container を想定
        if (chartContainer) {
            // 既存のcanvasがあれば何もしない、なければ作成する
            if (!document.getElementById(canvasId)) {
                console.log(`prepareCanvasArea: Canvas with ID ${canvasId} not found. Creating it.`); // ★デバッグログ
                const newCanvas = document.createElement('canvas');
                newCanvas.id = canvasId;
                // newCanvas.style.width = '100%'; // Chart.jsが制御するので不要な場合が多い
                // newCanvas.style.height = '100%';
                chartContainer.innerHTML = ''; // コンテナを一旦クリア
                chartContainer.appendChild(newCanvas);
            } else {
                console.log(`prepareCanvasArea: Canvas with ID ${canvasId} already exists.`); // ★デバッグログ
            }
        } else {
            console.error(`prepareCanvasArea: Parent container for ${canvasId} not found.`); // ★デバッグログ
        }
    }

    // --- チャートをクリアしてメッセージを表示する関数 ---
    function clearChartsAndDisplayMessage(message) {
        console.log(`clearChartsAndDisplayMessage: Clearing charts and displaying message: "${message}"`); // ★デバッグログ
        const productChartCanvas = document.getElementById('salesByProductChart');
        const timeChartCanvas = document.getElementById('salesOverTimeChart');

        if (salesByProductChartInstance) {
            salesByProductChartInstance.destroy();
            salesByProductChartInstance = null;
        }
        if (productChartCanvas && productChartCanvas.getContext('2d')) { // canvas要素が存在し、コンテキストも取得できる場合
            const ctx = productChartCanvas.getContext('2d');
            ctx.clearRect(0, 0, productChartCanvas.width, productChartCanvas.height);
            // メッセージをcanvasに描画する代わりに、親コンテナにpタグで表示する方が簡単で見栄えも良い
        }
        if (productChartCanvas?.parentElement) { // 親コンテナがあればメッセージ表示
            productChartCanvas.parentElement.innerHTML = `<p class="no-data-message">${message}</p>`;
        }


        if (salesOverTimeChartInstance) {
            salesOverTimeChartInstance.destroy();
            salesOverTimeChartInstance = null;
        }
        if (timeChartCanvas && timeChartCanvas.getContext('2d')) {
            const ctx = timeChartCanvas.getContext('2d');
            ctx.clearRect(0, 0, timeChartCanvas.width, timeChartCanvas.height);
        }
        if (timeChartCanvas?.parentElement) {
            timeChartCanvas.parentElement.innerHTML = `<p class="no-data-message">${message}</p>`;
        }
    }

    // renderSalesByProductChart と renderSalesOverTimeChart は前回の完全版を使用してください。
    // 特に、関数の冒頭で getContext('2d') を行い、null チェックをすることが重要です。
    // ... (renderSalesByProductChart と renderSalesOverTimeChart の完全なコードをここに配置) ...
    // ※ 前回の回答の「js/admin-script.js の修正箇所 (グラフ描画関数)」を参照

 // --- 売上商品別グラフ ---
    function renderSalesByProductChart(salesData) {
        const salesByProductCtx = document.getElementById('salesByProductChart')?.getContext('2d');
        if (!salesByProductCtx) {
            console.warn("renderSalesByProductChart: Canvas context not found.");
            return;
        }

        if (salesData.length === 0) {
            if (salesByProductChartInstance) {
                salesByProductChartInstance.destroy();
                salesByProductChartInstance = null; // インスタンスをクリア
            }
            salesByProductCtx.clearRect(0, 0, salesByProductCtx.canvas.width, salesByProductCtx.canvas.height);
            salesByProductCtx.font = "16px Arial";
            salesByProductCtx.fillStyle = "#777";
            salesByProductCtx.textAlign = "center";
            salesByProductCtx.fillText("該当データなし", salesByProductCtx.canvas.width / 2, salesByProductCtx.canvas.height / 2);
            return;
        }

        const productSales = {};
        salesData.forEach(sale => {
            if (!sale.items || !Array.isArray(sale.items)) return;
            sale.items.forEach(item => {
                if (!productSales[item.productId]) {
                    productSales[item.productId] = { name: item.name || '商品名不明', salesAmount: 0, refundAmount: 0 };
                }
                // 'served' も売上としてカウントする
                if (sale.status === 'completed' || sale.status === 'served') {
                    productSales[item.productId].salesAmount += (item.price || 0) * (item.quantity || 0);
                } else if (sale.status === 'refunded') {
                    productSales[item.productId].refundAmount += (item.price || 0) * (item.quantity || 0);
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

    // --- 時間帯別売上グラフ ---
    function renderSalesOverTimeChart(salesData, overallStartTime, overallEndTime) {
        const salesOverTimeCtx = document.getElementById('salesOverTimeChart')?.getContext('2d');
        if (!salesOverTimeCtx) {
            console.warn("renderSalesOverTimeChart: Canvas context not found.");
            return;
        }

        if (salesData.length === 0) {
            if (salesOverTimeChartInstance) {
                salesOverTimeChartInstance.destroy();
                salesOverTimeChartInstance = null; // インスタンスをクリア
            }
            salesOverTimeCtx.clearRect(0, 0, salesOverTimeCtx.canvas.width, salesOverTimeCtx.canvas.height);
            salesOverTimeCtx.font = "16px Arial";
            salesOverTimeCtx.fillStyle = "#777";
            salesOverTimeCtx.textAlign = "center";
            salesOverTimeCtx.fillText("該当データなし", salesOverTimeCtx.canvas.width / 2, salesOverTimeCtx.canvas.height / 2);
            return;
        }

        const salesByTimeSlot = {};
        const slotHours = 3;
        let chartStartTime, chartEndTime;

        if (overallStartTime && overallEndTime) {
            chartStartTime = new Date(overallStartTime);
            chartEndTime = new Date(overallEndTime);
        } else if (salesData.length > 0) {
            const timestamps = salesData
                .filter(s => s.timestamp && typeof s.timestamp.toDate === 'function') // 有効なタイムスタンプを持つデータのみフィルタリング
                .map(s => s.timestamp.toDate().getTime());
            if (timestamps.length === 0) { // 有効なタイムスタンプが一つもない場合
                chartStartTime = new Date(); chartStartTime.setHours(0,0,0,0);
                chartEndTime = new Date(); chartEndTime.setHours(23,59,59,999);
            } else {
                chartStartTime = new Date(Math.min(...timestamps));
                chartEndTime = new Date(Math.max(...timestamps));
            }
        } else { // データも期間指定もない場合
            chartStartTime = new Date(); chartStartTime.setHours(0,0,0,0);
            chartEndTime = new Date(); chartEndTime.setHours(23,59,59,999);
        }
        chartStartTime.setHours(Math.floor(chartStartTime.getHours() / slotHours) * slotHours, 0, 0, 0);

        const labels = [];
        let currentSlotStart = new Date(chartStartTime);
        while (currentSlotStart <= chartEndTime) {
            const slotKey = `${currentSlotStart.getFullYear()}-${String(currentSlotStart.getMonth() + 1).padStart(2, '0')}-${String(currentSlotStart.getDate()).padStart(2, '0')} ${String(currentSlotStart.getHours()).padStart(2, '0')}:00`;
            labels.push(slotKey);
            salesByTimeSlot[slotKey] = { salesAmount: 0, refundAmount: 0 };
            currentSlotStart.setHours(currentSlotStart.getHours() + slotHours);
        }

        salesData.forEach(sale => {
            if (!sale.timestamp || typeof sale.timestamp.toDate !== 'function') return;
            const saleTime = sale.timestamp.toDate();
            const slotStartHour = Math.floor(saleTime.getHours() / slotHours) * slotHours;
            const slotKeyDate = new Date(saleTime);
            slotKeyDate.setHours(slotStartHour, 0, 0, 0);
            const slotKey = `${slotKeyDate.getFullYear()}-${String(slotKeyDate.getMonth() + 1).padStart(2, '0')}-${String(slotKeyDate.getDate()).padStart(2, '0')} ${String(slotKeyDate.getHours()).padStart(2, '0')}:00`;

            if (salesByTimeSlot[slotKey]) {
                let transactionAmount = 0;
                if (sale.items && Array.isArray(sale.items)) {
                    sale.items.forEach(item => transactionAmount += (item.price || 0) * (item.quantity || 0));
                }
                if (sale.status === 'completed' || sale.status === 'served') {
                    salesByTimeSlot[slotKey].salesAmount += transactionAmount;
                } else if (sale.status === 'refunded') {
                    salesByTimeSlot[slotKey].refundAmount += transactionAmount;
                }
            }
        });

        const salesAmounts = labels.map(key => salesByTimeSlot[key] ? salesByTimeSlot[key].salesAmount : 0);
        const refundAmounts = labels.map(key => salesByTimeSlot[key] ? salesByTimeSlot[key].refundAmount : 0);

        if (salesOverTimeChartInstance) {
            salesOverTimeChartInstance.destroy();
        }
        salesOverTimeChartInstance = new Chart(salesOverTimeCtx, {
            type: 'bar', // または 'line'
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
                        title: { display: true, text: '時間帯 (3時間ごと)' }
                        // type: 'time', // もし時間軸として扱いたい場合
                        // time: { unit: 'hour', stepSize: 3, displayFormats: { hour: 'MM/dd HH:mm' } }
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
    function displayQueueStatus() {
        const queueStatusRef = db.collection('queue').doc('currentStatus'); // ローカルで再定義
        queueStatusRef.onSnapshot(doc => {
            if(!adminServingTicketSpan || !adminLastIssuedTicketSpan || !adminWaitingCountSpan) return;
            if (doc.exists) {
                const data = doc.data();
                adminServingTicketSpan.textContent = data.servingTicket || 0;
                adminLastIssuedTicketSpan.textContent = data.lastIssuedTicket || 0;
                adminWaitingCountSpan.textContent = data.waitingCount || 0;
            } else {
                adminServingTicketSpan.textContent = 'N/A'; adminLastIssuedTicketSpan.textContent = 'N/A'; adminWaitingCountSpan.textContent = 'N/A';
            }
        }, err => console.error("Error listening to admin queue status: ", err));
    }

    refreshDataButton?.addEventListener('click', fetchDataAndRenderCharts);

    function initializeDashboard() {
        if (typeof firebase === 'undefined' || typeof db === 'undefined') { console.error("Firebase or DB not initialized."); return; }
        const today = new Date().toISOString().split('T')[0];
        if(dateSelector) dateSelector.value = today;
        if(timeRangeSelector) timeRangeSelector.value = 'today';

        queueStatusRefForAdminDisplayMode.get().then(doc => {
            if (doc.exists && displayModeSelect) {
                const currentMode = doc.data().displayMode || "normal";
                displayModeSelect.value = currentMode;
            }
        }).catch(err => console.error("Error fetching current display mode for admin:", err));

        fetchDataAndRenderCharts();
        displayQueueStatus();
    }
});