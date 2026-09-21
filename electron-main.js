const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// Oyna masshtabi (zoom) sozlamasi shu faylda saqlanadi, shunda ilova
// qayta ochilganda foydalanuvchi tanlagan masshtab darajasi tiklanadi.
const ZOOM_CONFIG_PATH = path.join(app.getPath('userData'), 'zoom-config.json');
const ZOOM_STEP = 0.5;
const MIN_ZOOM = -5;
const MAX_ZOOM = 6;

function loadZoomLevel() {
  try {
    const data = JSON.parse(fs.readFileSync(ZOOM_CONFIG_PATH, 'utf8'));
    if (typeof data.zoomLevel === 'number') return data.zoomLevel;
  } catch (_) {}
  return 0;
}

function saveZoomLevel(zoomLevel) {
  try {
    fs.writeFileSync(ZOOM_CONFIG_PATH, JSON.stringify({ zoomLevel }));
  } catch (_) {}
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    title: 'FORGET — Buxgalteriya bazasi',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const { webContents } = win;

  function setZoom(newLevel) {
    webContents.zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newLevel));
    saveZoomLevel(webContents.zoomLevel);
  }

  // Sahifa (qayta) yuklanganda saqlangan masshtabni tiklash.
  webContents.on('did-finish-load', () => {
    webContents.zoomLevel = loadZoomLevel();
  });

  // Ctrl + sichqoncha g'ildiragi orqali masshtablash.
  webContents.on('zoom-changed', (_event, zoomDirection) => {
    setZoom(webContents.zoomLevel + (zoomDirection === 'in' ? ZOOM_STEP : -ZOOM_STEP));
  });

  // Ctrl+= / Ctrl+- / Ctrl+0 tezkor tugmalari — Electron menyu
  // akselleratorlari orqali (before-input-event'dan farqli, bu usul
  // Windows'da har doim ishlaydi). Menyu autoHideMenuBar tufayli
  // ko'rinmaydi, faqat Alt bosilganda chiqadi.
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Ko\'rinish',
      submenu: [
        {
          label: 'Kattalashtirish',
          accelerator: 'CommandOrControl+=',
          click: () => setZoom(webContents.zoomLevel + ZOOM_STEP),
        },
        {
          label: 'Kattalashtirish (+)',
          accelerator: 'CommandOrControl+Plus',
          visible: false,
          acceleratorWorksWhenHidden: true,
          click: () => setZoom(webContents.zoomLevel + ZOOM_STEP),
        },
        {
          label: 'Kichraytirish',
          accelerator: 'CommandOrControl+-',
          click: () => setZoom(webContents.zoomLevel - ZOOM_STEP),
        },
        {
          label: 'Asl holat (100%)',
          accelerator: 'CommandOrControl+0',
          click: () => setZoom(0),
        },
      ],
    },
  ]));

  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
