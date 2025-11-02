const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  print: (receiptHTML) => ipcRenderer.invoke('print-receipt', receiptHTML),
});