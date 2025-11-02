const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  ipcMain.handle('print-receipt', async (event, receiptHTML) => {
    let printWin = null;
    try {
      printWin = new BrowserWindow({ 
          show: false, // 最終的には false にしますが、テスト中は true でもOK
          webPreferences: { nodeIntegration: false, contextIsolation: true }
      });
      
      const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(receiptHTML);
      
      const loadPromise = new Promise(resolve => {
        printWin.webContents.once('did-finish-load', resolve);
      });
      await printWin.loadURL(dataUrl);
      await loadPromise;

      // 描画が安定するまで少し待つ
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const deviceName = 'Star TSP100 Cutter (TSP143)';
      
      await new Promise((resolve, reject) => {
        printWin.webContents.print({ 
          silent: true,
          deviceName: deviceName,
          margins: { marginType: 'none' }
        }, (success, failureReason) => {
          if (success) {
            console.log('印刷コマンド成功');
            resolve();
          } else {
            const reason = failureReason || 'Unknown error';
            console.error('印刷コマンド失敗:', reason);
            reject(new Error(reason));
          }
        });
      });
      
      return { success: true, message: 'Print successful' };

    } catch (error) {
      console.error('印刷プロセスエラー:', error.message);
      return { success: false, message: error.message };
    } finally {
      if (printWin && !printWin.isDestroyed()) {
        printWin.close();
      }
    }
  });

  win.loadURL('https://chofusai-possystem.web.app/printer.html');
  win.webContents.openDevTools();
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { app.quit(); });