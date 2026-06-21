const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const { Client } = require('minecraft-launcher-core');
const Handler = require('minecraft-launcher-core/components/handler');
const RPC = require('discord-rpc');
const { autoUpdater } = require('electron-updater');
const { Worker } = require('worker_threads');

// ============================================================
// ОФЛАЙН АВТОРИЗАЦИЯ
// ============================================================

function offlineAuth(username, version) {
  const hash = crypto.createHash('md5').update('OfflinePlayer:' + username).digest();
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  const uuid = `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20, 32)}`;
  let authType = 'legacy';
  if (version) {
    const parts = version.split('.');
    const minor = parseInt(parts[1], 10);
    if (!isNaN(minor) && minor >= 13) authType = 'mojang';
  }
  return {
    access_token: crypto.createHash('sha256').update(username + uuid).digest('hex'),
    client_token: uuid,
    uuid: uuid,
    name: username,
    user_properties: '{}',
    meta: { type: authType }
  };
}

// ============================================================
// ПАТЧИ MCLC
// ============================================================

Handler.prototype.getAssets = async function () {};

Handler.prototype.downloadAsync = function (url, directory, name, retry, type) {
  return new Promise((resolve) => {
    try { fs.mkdirSync(directory, { recursive: true }); } catch (e) {}
    const filePath = path.join(directory, name);
    (async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const response = await axios.get(url, { responseType: 'stream', timeout: 60000, maxRedirects: 10 });
          if (response.status === 404) { this.client.emit('debug', `[MCLC]: 404 ${url}`); return resolve(false); }
          const writer = fs.createWriteStream(filePath);
          response.data.pipe(writer);
          await new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej); response.data.on('error', rej); });
          this.client.emit('download', name);
          return resolve({ failed: false, asset: null });
        } catch (err) {
          if (fs.existsSync(filePath)) try { fs.unlinkSync(filePath); } catch (e) {}
          if (attempt === 4) { this.client.emit('debug', `[MCLC]: FAIL ${name}`); return resolve(false); }
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
      resolve(false);
    })();
  });
};

process.on('uncaughtException', (e) => console.error('[FATAL]', e));
process.on('unhandledRejection', (e) => console.error('[UNHANDLED]', e));

// ============================================================
// КОНСТАНТЫ
// ============================================================

const launcherDir = path.join(process.env.APPDATA, '.my-custom-server');
const versionsDir = path.join(launcherDir, 'versions');
const javaDir = path.join(launcherDir, 'java');
const javaBinPath = path.join(javaDir, 'bin', 'java.exe');
const instancesDir = path.join(launcherDir, 'instances');

const userDataPath = app.getPath('userData');
const accountsFilePath = path.join(userDataPath, 'accounts.json');
const settingsFilePath = path.join(userDataPath, 'settings.json');
const selectedProfilePath = path.join(userDataPath, 'selected-profile.json');
const customProfilesPath = path.join(userDataPath, 'custom-profiles.json');
const modsRegistryPath = path.join(launcherDir, 'mods-registry.json');

const FABRIC_META_URL = 'https://meta.fabricmc.net/v2/versions/loader';
const MOJANG_MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';

const REDOX_ID = 'redox-12111';
const REDOX_VERSION = '1.21.11';

// ============================================================
// DISCORD RICH PRESENCE
// ============================================================

const DISCORD_CLIENT_ID = '1517136504030363658';
let rpc = null;
let rpcReady = false;

function initDiscordRPC() {
  try {
    rpc = new RPC.Client({ transport: 'ipc' });
    rpc.on('ready', () => {
      rpcReady = true;
      console.log('[DRP] Discord RPC подключён');
      updateDiscordPresence('menu');
    });
    rpc.on('disconnected', () => { rpcReady = false; });
    rpc.login({ clientId: DISCORD_CLIENT_ID }).catch(() => {
      console.log('[DRP] Discord не найден, RPC отключён');
      rpcReady = false;
    });
  } catch (e) {
    console.log('[DRP] Ошибка инициализации:', e.message);
    rpcReady = false;
  }
}

let drpState = 'menu';
let drpPartySize = 0;
const drpPartyMax = 2026;

function updateDiscordPresence(mode, extra) {
  if (!rpcReady || !rpc) return;
  try {
    drpState = mode;
    let details, state;

    if (mode === 'menu') {
      details = 'В главном меню';
      state = 'Выбирает профиль';
    } else if (mode === 'server') {
      details = 'Играет на redoku.bisquit.host | REDOKU Season III';
      state = drpPartySize > 0 ? `${drpPartySize} из ${drpPartyMax} игроков` : 'Ожидает игроков';
    } else if (mode === 'singleplayer') {
      details = 'Одиночная игра';
      state = `Версия: ${extra || '???'}`;
    }

    const payload = {
      details,
      state,
      largeImageKey: 'logo',
      largeImageText: 'Redoku Сезон 3',
      smallImageKey: 'mc grass',
      smallImageText: 'Minecraft',
      instance: false
    };

    if (mode === 'server') {
      payload.partySize = drpPartySize;
      payload.partyMax = drpPartyMax;
    }

    rpc.setActivity(payload);
  } catch (e) {
    console.log('[DRP] Ошибка обновления:', e.message);
  }
}

function updateDRPPlayerCount(online) {
  drpPartySize = online || 0;
  if (drpState === 'server') {
    updateDiscordPresence('server');
  }
}

// ============================================================
// УТИЛИТЫ
// ============================================================

async function ensureDirectories() {
  const dirs = [userDataPath, launcherDir, versionsDir, javaDir, instancesDir];
  await Promise.all(dirs.map(d => fs.promises.mkdir(d, { recursive: true })));
}

function readJsonFile(p, def) {
  try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) {}
  return def;
}

function writeJsonFile(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

function streamDownload(url, filePath, axiosOpts = {}) {
  return axios.get(url, { responseType: 'stream', timeout: 120000, maxRedirects: 5, ...axiosOpts })
    .then(resp => new Promise((resolve, reject) => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const ws = fs.createWriteStream(filePath);
      resp.data.pipe(ws);
      ws.on('finish', () => resolve(true));
      ws.on('error', reject);
      resp.data.on('error', reject);
    }));
}

// ============================================================
// НАСТРОЙКИ
// ============================================================

function loadSettings() {
  return readJsonFile(settingsFilePath, {
    ram: 4,
    ramAuto: false,
    filterReleases: true,
    filterSnapshots: false,
    filterFabric: true,
    filterForge: true,
    filterOld: false,
    gamePath: '',
    windowWidth: 854,
    windowHeight: 480,
    fullscreen: false,
    gpu: 'auto',
    syncOptions: false,
    syncMods: false,
    syncSaves: false,
    syncResourcepacks: false,
    syncShaderpacks: false,
    syncServers: false,
    modrinthLoadLimit: 20,
    launcherSize: 'compact',
    launcherWidth: 960,
    launcherHeight: 800
  });
}

function saveSettings(settings) {
  writeJsonFile(settingsFilePath, settings);
}

// ============================================================
// СИНХРОНИЗАЦИЯ ДАННЫХ: _shared_assets + symlinks/junctions
// ============================================================

const sharedAssetsDir = path.join(launcherDir, '_shared_assets');

async function ensureSharedAssets() {
  const dirs = [
    sharedAssetsDir,
    path.join(sharedAssetsDir, 'saves'),
    path.join(sharedAssetsDir, 'mods'),
    path.join(sharedAssetsDir, 'resourcepacks'),
    path.join(sharedAssetsDir, 'shaderpacks')
  ];
  await Promise.all(dirs.map(d => fs.promises.mkdir(d, { recursive: true })));
  const optSrc = path.join(sharedAssetsDir, 'options.txt');
  try { await fs.promises.access(optSrc); } catch { await fs.promises.writeFile(optSrc, '', 'utf8'); }
  const srvSrc = path.join(sharedAssetsDir, 'servers.dat');
  try { await fs.promises.access(srvSrc); } catch { await fs.promises.writeFile(srvSrc, '', 'binary'); }
}

function safeSend(channel, data) {
  try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data); } catch {}
}

async function isSymlinkOrJunction(p) {
  try {
    const stat = await fs.promises.lstat(p);
    return stat.isSymbolicLink();
  } catch { return false; }
}

async function isHardlink(p) {
  try {
    const stat = await fs.promises.lstat(p);
    return stat.nlink > 1;
  } catch { return false; }
}

async function moveDirContents(srcDir, destDir) {
  await fs.promises.mkdir(destDir, { recursive: true });
  const entries = await fs.promises.readdir(srcDir);
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry);
    const destPath = path.join(destDir, entry);
    const stat = await fs.promises.lstat(srcPath);
    if (stat.isDirectory()) {
      if (await isSymlinkOrJunction(srcPath)) {
        const target = fs.readlinkSync(srcPath);
        await fs.promises.rm(srcPath, { recursive: true, force: true });
        fs.symlinkSync(target, destPath, 'junction');
      } else {
        await moveDirContents(srcPath, destPath);
        await fs.promises.rm(srcPath, { recursive: true, force: true });
      }
    } else {
      await fs.promises.copyFile(srcPath, destPath);
      await fs.promises.rm(srcPath, { force: true });
    }
  }
}

async function applySharedSettings(instanceName) {
  const settings = loadSettings();
  const instanceDir = getInstanceDir(instanceName);

  await ensureSharedAssets();

  // === Общие миры (saves) ===
  try {
    const savesPath = path.join(instanceDir, 'saves');
    if (settings.syncSaves) {
      if (fs.existsSync(savesPath) && !(await isSymlinkOrJunction(savesPath))) {
        const sharedSaves = path.join(sharedAssetsDir, 'saves');
        await moveDirContents(savesPath, sharedSaves);
        fs.rmSync(savesPath, { recursive: true, force: true });
        fs.symlinkSync(sharedSaves, savesPath, 'junction');
        safeSend('launch-progress', { status: 'sync', message: 'Синхронизация: общие миры подключены' });
      } else if (!fs.existsSync(savesPath)) {
        fs.symlinkSync(path.join(sharedAssetsDir, 'saves'), savesPath, 'junction');
      }
    } else {
      if (await isSymlinkOrJunction(savesPath)) {
        const sharedSaves = path.join(sharedAssetsDir, 'saves');
        fs.rmSync(savesPath, { force: true });
        fs.mkdirSync(savesPath, { recursive: true });
        if (fs.existsSync(sharedSaves)) {
          for (const entry of fs.readdirSync(sharedSaves)) {
            const src = path.join(sharedSaves, entry);
            const dst = path.join(savesPath, entry);
            fs.cpSync(src, dst, { recursive: true });
          }
        }
        safeSend('launch-progress', { status: 'sync', message: 'Синхронизация: миры отключены (изолированная копия)' });
      }
    }
  } catch (e) {
    safeSend('launch-progress', { status: 'sync-error', message: `Ошибка синхронизации saves: ${e.message}` });
  }

  // === Общие моды (mods) ===
  try {
    const modsPath = path.join(instanceDir, 'mods');
    if (settings.syncMods) {
      if (fs.existsSync(modsPath) && !(await isSymlinkOrJunction(modsPath))) {
        const sharedMods = path.join(sharedAssetsDir, 'mods');
        await moveDirContents(modsPath, sharedMods);
        fs.rmSync(modsPath, { recursive: true, force: true });
        fs.symlinkSync(sharedMods, modsPath, 'junction');
        safeSend('launch-progress', { status: 'sync', message: 'Синхронизация: общие моды подключены' });
      } else if (!fs.existsSync(modsPath)) {
        fs.symlinkSync(path.join(sharedAssetsDir, 'mods'), modsPath, 'junction');
      }
    } else {
      if (await isSymlinkOrJunction(modsPath)) {
        const sharedMods = path.join(sharedAssetsDir, 'mods');
        fs.rmSync(modsPath, { force: true });
        fs.mkdirSync(modsPath, { recursive: true });
        if (fs.existsSync(sharedMods)) {
          for (const entry of fs.readdirSync(sharedMods)) {
            const src = path.join(sharedMods, entry);
            const dst = path.join(modsPath, entry);
            fs.cpSync(src, dst, { recursive: true });
          }
        }
        safeSend('launch-progress', { status: 'sync', message: 'Синхронизация: моды отключены (изолированная копия)' });
      }
    }
  } catch (e) {
    safeSend('launch-progress', { status: 'sync-error', message: `Ошибка синхронизации mods: ${e.message}` });
  }

  // === Общие настройки игры (options.txt — hardlink) ===
  try {
    const optPath = path.join(instanceDir, 'options.txt');
    const sharedOpt = path.join(sharedAssetsDir, 'options.txt');
    await ensureSharedAssets();

    if (settings.syncOptions) {
      if (fs.existsSync(optPath) && !(await isHardlink(optPath)) && !(await isSymlinkOrJunction(optPath))) {
        fs.copyFileSync(optPath, sharedOpt);
        fs.rmSync(optPath, { force: true });
        fs.linkSync(sharedOpt, optPath);
        safeSend('launch-progress', { status: 'sync', message: 'Синхронизация: общие настройки игры подключены' });
      } else if (!fs.existsSync(optPath)) {
        fs.linkSync(sharedOpt, optPath);
      }
    } else {
      if (await isHardlink(optPath)) {
        fs.copyFileSync(optPath, sharedOpt);
        fs.rmSync(optPath, { force: true });
        fs.writeFileSync(optPath, fs.readFileSync(sharedOpt), 'utf8');
        safeSend('launch-progress', { status: 'sync', message: 'Синхронизация: настройки игры отключены (изолированная копия)' });
      }
    }
  } catch (e) {
    safeSend('launch-progress', { status: 'sync-error', message: `Ошибка синхронизации options.txt: ${e.message}` });
  }

  // === Общие ресурспаки (resourcepacks) ===
  try {
    const rpPath = path.join(instanceDir, 'resourcepacks');
    if (settings.syncResourcepacks) {
      if (fs.existsSync(rpPath) && !(await isSymlinkOrJunction(rpPath))) {
        const sharedRp = path.join(sharedAssetsDir, 'resourcepacks');
        await moveDirContents(rpPath, sharedRp);
        fs.rmSync(rpPath, { recursive: true, force: true });
        fs.symlinkSync(sharedRp, rpPath, 'junction');
        safeSend('launch-progress', { status: 'sync', message: 'Синхронизация: общие ресурспаки подключены' });
      } else if (!fs.existsSync(rpPath)) {
        fs.symlinkSync(path.join(sharedAssetsDir, 'resourcepacks'), rpPath, 'junction');
      }
    } else {
      if (await isSymlinkOrJunction(rpPath)) {
        const sharedRp = path.join(sharedAssetsDir, 'resourcepacks');
        fs.rmSync(rpPath, { force: true });
        fs.mkdirSync(rpPath, { recursive: true });
        if (fs.existsSync(sharedRp)) {
          for (const entry of fs.readdirSync(sharedRp)) {
            const src = path.join(sharedRp, entry);
            const dst = path.join(rpPath, entry);
            fs.cpSync(src, dst, { recursive: true });
          }
        }
        safeSend('launch-progress', { status: 'sync', message: 'Синхронизация: ресурспаки отключены (изолированная копия)' });
      }
    }
  } catch (e) {
    safeSend('launch-progress', { status: 'sync-error', message: `Ошибка синхронизации resourcepacks: ${e.message}` });
  }

  // === Общие шейдеры (shaderpacks) ===
  try {
    const spPath = path.join(instanceDir, 'shaderpacks');
    if (settings.syncShaderpacks) {
      if (fs.existsSync(spPath) && !(await isSymlinkOrJunction(spPath))) {
        const sharedSp = path.join(sharedAssetsDir, 'shaderpacks');
        await moveDirContents(spPath, sharedSp);
        fs.rmSync(spPath, { recursive: true, force: true });
        fs.symlinkSync(sharedSp, spPath, 'junction');
        safeSend('launch-progress', { status: 'sync', message: 'Синхронизация: общие шейдеры подключены' });
      } else if (!fs.existsSync(spPath)) {
        fs.symlinkSync(path.join(sharedAssetsDir, 'shaderpacks'), spPath, 'junction');
      }
    } else {
      if (await isSymlinkOrJunction(spPath)) {
        const sharedSp = path.join(sharedAssetsDir, 'shaderpacks');
        fs.rmSync(spPath, { force: true });
        fs.mkdirSync(spPath, { recursive: true });
        if (fs.existsSync(sharedSp)) {
          for (const entry of fs.readdirSync(sharedSp)) {
            const src = path.join(sharedSp, entry);
            const dst = path.join(spPath, entry);
            fs.cpSync(src, dst, { recursive: true });
          }
        }
        safeSend('launch-progress', { status: 'sync', message: 'Синхронизация: шейдеры отключены (изолированная копия)' });
      }
    }
  } catch (e) {
    safeSend('launch-progress', { status: 'sync-error', message: `Ошибка синхронизации shaderpacks: ${e.message}` });
  }

  // === Общий список серверов (servers.dat — hardlink) ===
  try {
    const srvPath = path.join(instanceDir, 'servers.dat');
    const sharedSrv = path.join(sharedAssetsDir, 'servers.dat');
    await ensureSharedAssets();

    if (settings.syncServers) {
      if (fs.existsSync(srvPath) && !(await isHardlink(srvPath)) && !(await isSymlinkOrJunction(srvPath))) {
        fs.copyFileSync(srvPath, sharedSrv);
        fs.rmSync(srvPath, { force: true });
        fs.linkSync(sharedSrv, srvPath);
        safeSend('launch-progress', { status: 'sync', message: 'Синхронизация: общий список серверов подключён' });
      } else if (!fs.existsSync(srvPath)) {
        fs.linkSync(sharedSrv, srvPath);
      }
    } else {
      if (await isHardlink(srvPath)) {
        fs.copyFileSync(srvPath, sharedSrv);
        fs.rmSync(srvPath, { force: true });
        fs.writeFileSync(srvPath, fs.readFileSync(sharedSrv));
        safeSend('launch-progress', { status: 'sync', message: 'Синхронизация: список серверов отключён (изолированная копия)' });
      }
    }
  } catch (e) {
    safeSend('launch-progress', { status: 'sync-error', message: `Ошибка синхронизации servers.dat: ${e.message}` });
  }
}

// ============================================================
// СЕРВЕР: мониторинг
// ============================================================

let cachedServerStatus = null;
let serverTimer = null;

async function fetchServerStatus() {
  try {
    const settings = loadSettings();
    const addr = settings.serverAddress || '5.83.140.210:25784';
    const url = `https://api.mcsrvstat.us/3/${addr}`;
    const startTime = Date.now();
    const resp = await axios.get(url, { timeout: 5000 });
    const ping = Date.now() - startTime;
    const data = resp.data;
    if (data && data.online) {
      cachedServerStatus = {
        online: true,
        players: data.players?.online || 0,
        max: data.players?.max || 50,
        version: data.version?.name || 'Unknown',
        ping: ping
      };
    } else {
      cachedServerStatus = { online: false };
    }
  } catch (e) {
    cachedServerStatus = { online: false };
  }
  return cachedServerStatus;
}

function startServerMonitor(mainWindow) {
  const send = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    fetchServerStatus().then(status => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send('server-status', status);
      if (status.online) {
        updateDRPPlayerCount(status.players);
      }
    });
  };

  send();
  serverTimer = setInterval(send, 30000);
}

// ============================================================
// МАНИФЕСТ: все версии Minecraft
// ============================================================

let cachedManifest = null;

async function fetchMojangManifest() {
  if (cachedManifest) return cachedManifest;
  const resp = await axios.get(MOJANG_MANIFEST_URL, { timeout: 15000 });
  cachedManifest = resp.data;
  return cachedManifest;
}

async function fetchAllVersions() {
  const manifest = await fetchMojangManifest();
  return manifest.versions.map(v => ({
    id: v.id,
    type: v.type,
    url: v.url,
    releaseTime: v.releaseTime
  }));
}

function isVersionDownloaded(versionId) {
  const vDir = path.join(versionsDir, versionId);
  const fDir = path.join(versionsDir, `${versionId}-fabric`);
  return fs.existsSync(vDir) || fs.existsSync(fDir);
}

// ============================================================
// ПРОФИЛИ (кастомные)
// ============================================================

function loadCustomProfiles() {
  return readJsonFile(customProfilesPath, []);
}

function saveCustomProfiles(profiles) {
  writeJsonFile(customProfilesPath, profiles);
}

function addCustomProfile(name, version, loader) {
  const profiles = loadCustomProfiles();
  const id = `custom-${Date.now()}`;
  profiles.push({ id, name, version, loader });
  saveCustomProfiles(profiles);
  return profiles;
}

function deleteCustomProfile(id) {
  let profiles = loadCustomProfiles();
  profiles = profiles.filter(p => p.id !== id);
  saveCustomProfiles(profiles);
  const instanceName = getInstanceName(id, null, null);
  const d = path.join(instancesDir, instanceName);
  if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
  return profiles;
}

function getInstanceName(profileId, version, loader) {
  if (profileId === REDOX_ID) return `${REDOX_VERSION}_RedoX`;
  const profiles = loadCustomProfiles();
  const p = profiles.find(x => x.id === profileId);
  const v = version || p?.version || 'unknown';
  const l = loader || p?.loader || 'vanilla';
  return `${v}_${l.charAt(0).toUpperCase() + l.slice(1)}`;
}

function getInstanceDir(instanceName) { return path.join(instancesDir, instanceName); }
function getModsDir(instanceName) { return path.join(getInstanceDir(instanceName), 'mods'); }

function getSelectedProfile() { return readJsonFile(selectedProfilePath, { id: REDOX_ID }); }
function saveSelectedProfile(id) { writeJsonFile(selectedProfilePath, { id }); }

// ============================================================
// АККАУНТЫ
// ============================================================

function loadAccounts() { return readJsonFile(accountsFilePath, []); }
function saveAccounts(a) { writeJsonFile(accountsFilePath, a); }

function addAccount(u) {
  const a = loadAccounts();
  if (a.includes(u)) throw new Error('Аккаунт уже существует');
  a.push(u); saveAccounts(a); return a;
}

function removeAccount(u) {
  let a = loadAccounts(); a = a.filter(x => x !== u); saveAccounts(a); return a;
}

// ============================================================
// МОДЫ
// ============================================================

function scanModsFolder(instanceName) {
  const d = getModsDir(instanceName);
  if (!fs.existsSync(d)) return [];
  const mods = [];
  for (const f of fs.readdirSync(d)) {
    try {
      const s = fs.statSync(path.join(d, f));
      if (!s.isFile()) continue;
      const l = f.toLowerCase();
      const on = l.endsWith('.jar') && !l.endsWith('.jar.disabled');
      const off = l.endsWith('.jar.disabled');
      if (on || off) mods.push({ name: f, size: s.size, enabled: on });
    } catch (e) {}
  }
  mods.sort((a, b) => a.name.localeCompare(b.name));
  return mods;
}

function toggleMod(instanceName, filename) {
  const d = getModsDir(instanceName);
  const old = path.join(d, filename);
  let nw, en;
  if (filename.toLowerCase().endsWith('.jar.disabled')) { nw = path.join(d, filename.replace(/\.disabled$/i, '')); en = true; }
  else if (filename.toLowerCase().endsWith('.jar')) { nw = path.join(d, filename + '.disabled'); en = false; }
  else throw new Error('Неизвестное расширение');
  if (!fs.existsSync(old)) throw new Error(`Файл не найден: ${filename}`);
  fs.mkdirSync(path.dirname(nw), { recursive: true });
  fs.renameSync(old, nw);
  return { name: path.basename(nw), enabled: en };
}

function removeMod(instanceName, filename) {
  const d = getModsDir(instanceName);
  const p = path.join(d, filename);
  if (!fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  removeModFromManifestByFile(instanceName, filename);
  return true;
}

// ============================================================
// МАНИФЕСТ УСТАНОВЛЕННЫХ МОДОВ
// ============================================================

function getManifestPath(instanceName) {
  return path.join(getInstanceDir(instanceName), 'installed_mods.json');
}

function getModManifest(instanceName) {
  return readJsonFile(getManifestPath(instanceName), {});
}

function saveModManifest(instanceName, manifest) {
  const mp = getManifestPath(instanceName);
  fs.mkdirSync(path.dirname(mp), { recursive: true });
  writeJsonFile(mp, manifest);
}

function addModToManifest(instanceName, projectId, fileName, modName, source) {
  const manifest = getModManifest(instanceName);
  manifest[projectId] = { fileName, modName, source: source || 'modrinth' };
  saveModManifest(instanceName, manifest);
}

function removeModFromManifest(instanceName, projectId) {
  const manifest = getModManifest(instanceName);
  delete manifest[projectId];
  saveModManifest(instanceName, manifest);
}

function removeModFromManifestByFile(instanceName, fileName) {
  const manifest = getModManifest(instanceName);
  for (const [pid, entry] of Object.entries(manifest)) {
    if (entry.fileName === fileName) {
      delete manifest[pid];
    }
  }
  saveModManifest(instanceName, manifest);
}

// ============================================================
// РЕКОМЕНДОВАННЫЕ МОДЫ
// ============================================================

const RECOMMENDED_MODS = [
  { id: 'distant-horizons', name: 'Distant Horizons', modrinthId: 'uCdwusMi', dependencies: [], graphic: true },
  { id: 'voxy', name: 'Voxy', modrinthId: 'fxxUqruK', dependencies: ['fabric-api', 'sodium', 'voxy-server-side'], graphic: true },
  { id: 'emotecraft', name: 'Emotecraft', modrinthId: 'pZ2wrerK', dependencies: ['fabric-api', 'player-animation-library'] },
  { id: 'plasmo-voice', name: 'Plasmo Voice', modrinthId: '1bZhdhsH', dependencies: ['fabric-api'] },
  { id: 'fabric-api', name: 'Fabric API', modrinthId: 'P7dR8mSH', dependencies: [], hidden: true },
  { id: 'player-animation-library', name: 'Player Animation Library', modrinthId: 'ha1mEyJS', dependencies: [], hidden: true },
  { id: 'sodium', name: 'Sodium', modrinthId: 'AANobbMI', dependencies: [] },
  { id: 'voxy-server-side', name: 'Voxy Server Side', modrinthId: '84zcagOb', dependencies: ['fabric-api'] }
];

async function downloadRecommendedMod(modId, instanceName) {
  const info = RECOMMENDED_MODS.find(m => m.id === modId);
  if (!info) throw new Error(`Неизвестный мод: ${modId}`);
  const reg = readJsonFile(modsRegistryPath, {});
  const key = `${instanceName}:${modId}`;
  if (reg[key]) {
    const p = path.join(getModsDir(instanceName), reg[key]);
    if (fs.existsSync(p)) return reg[key];
  }
  let versions;
  try {
    versions = (await axios.get(`https://api.modrinth.com/v2/project/${info.modrinthId}/version?loaders=["fabric"]&game_versions=["${REDOX_VERSION}"]`, { timeout: 15000 })).data;
  } catch {
    versions = (await axios.get(`https://api.modrinth.com/v2/project/${info.modrinthId}/version?loaders=["fabric"]`, { timeout: 15000 })).data;
  }
  if (!Array.isArray(versions) || !versions.length) throw new Error(`Нет версий ${info.name}`);
  let sel = versions[0];
  if (modId === 'sodium') {
    const stable = versions.find(v => !/beta|alpha|rc/.test(v.version_number));
    if (stable) sel = stable;
  }
  const file = sel.files.find(f => f.file_type === 'release-fabric') || sel.files[0];
  if (!file?.url) throw new Error(`Не найден файл ${info.name}`);
  const md = getModsDir(instanceName);
  fs.mkdirSync(md, { recursive: true });
  const fp = path.join(md, file.filename);
  await streamDownload(file.url, fp, { timeout: 120000 });
  reg[key] = file.filename;
  writeJsonFile(modsRegistryPath, reg);
  return file.filename;
}

function removeRecommendedMod(modId, instanceName) {
  const reg = readJsonFile(modsRegistryPath, {});
  const key = `${instanceName}:${modId}`;
  if (reg[key]) {
    const fp = path.join(getModsDir(instanceName), reg[key]);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    delete reg[key];
    writeJsonFile(modsRegistryPath, reg);
  }
  const disabledKey = key;
  for (const f of fs.readdirSync(getModsDir(instanceName))) {
    if (f.toLowerCase().endsWith('.jar.disabled') && f.toLowerCase().includes(modId.replace(/-/g, ''))) {
      fs.unlinkSync(path.join(getModsDir(instanceName), f));
    }
  }
}

// ============================================================
// JAVA 21
// ============================================================

async function ensureJava21() {
  if (fs.existsSync(javaBinPath)) return javaBinPath;
  if (fs.existsSync(javaDir)) {
    for (const d of fs.readdirSync(javaDir).filter(f => f.startsWith('jdk') || f.startsWith('jre'))) {
      const c = path.join(javaDir, d, 'bin', 'java.exe'); if (fs.existsSync(c)) return c;
    }
  }
  const resp = await axios.get('https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse', { responseType: 'stream', timeout: 180000, maxRedirects: 10 });
  const zp = path.join(javaDir, 'java21.zip');
  const w = fs.createWriteStream(zp);
  resp.data.pipe(w);
  await new Promise((res, rej) => { w.on('finish', res); w.on('error', rej); resp.data.on('error', rej); });
  await new Promise((resolve, reject) => {
    const worker = new Worker(
      `const AdmZip = require('adm-zip'); new AdmZip('${zp.replace(/\\/g, '\\\\')}').extractAllTo('${javaDir.replace(/\\/g, '\\\\')}', true);`,
      { eval: true }
    );
    worker.on('message', resolve);
    worker.on('error', (e) => { worker.terminate(); reject(e); });
  });
  try { fs.unlinkSync(zp); } catch (e) {}
  for (const d of fs.readdirSync(javaDir).filter(f => f.startsWith('jdk') || f.startsWith('jre'))) {
    const c = path.join(javaDir, d, 'bin', 'java.exe'); if (fs.existsSync(c)) return c;
  }
  throw new Error('java.exe не найден');
}

// ============================================================
// FABRIC / VANILLA
// ============================================================

async function fetchLatestFabricLoader(version) {
  const resp = await axios.get(`${FABRIC_META_URL}/${version}`, { timeout: 10000 });
  const data = resp.data;
  if (!Array.isArray(data) || !data.length) throw new Error('Fabric недоступен');
  return (data.find(v => v.stable) || data[0]).loader.version;
}

async function downloadFabricProfile(version, loaderVersion) {
  const vd = path.join(versionsDir, `${version}-fabric`);
  const pp = path.join(vd, `${version}-fabric.json`);
  if (fs.existsSync(pp)) return JSON.parse(fs.readFileSync(pp, 'utf8'));

  const fp = (await axios.get(`${FABRIC_META_URL}/${version}/${loaderVersion}/profile/json`, { timeout: 15000 })).data;
  const manifest = (await axios.get(MOJANG_MANIFEST_URL, { timeout: 10000 })).data;
  const entry = manifest.versions.find(v => v.id === version);
  if (!entry) throw new Error(`Версия ${version} не найдена`);
  const vp = (await axios.get(entry.url, { timeout: 10000 })).data;

  const m = {
    id: `${version}-fabric`, mainClass: fp.mainClass,
    arguments: {
      game: [...(vp.arguments?.game || []), ...(fp.arguments?.game || [])],
      jvm: [...(vp.arguments?.jvm || []), ...(fp.arguments?.jvm || [])]
    },
    libraries: [...(vp.libraries || []), ...(fp.libraries || [])],
    downloads: vp.downloads, assets: vp.assets, assetIndex: vp.assetIndex,
    minecraftArguments: fp.minecraftArguments || vp.minecraftArguments,
    type: 'release', processArguments: fp.processArguments || vp.processArguments
  };

  fs.mkdirSync(vd, { recursive: true });
  fs.writeFileSync(pp, JSON.stringify(m, null, 2), 'utf8');
  return m;
}

async function getVanillaVersionJson(version) {
  const vd = path.join(versionsDir, version);
  const jp = path.join(vd, `${version}.json`);
  if (fs.existsSync(jp)) return JSON.parse(fs.readFileSync(jp, 'utf8'));
  const manifest = (await axios.get(MOJANG_MANIFEST_URL, { timeout: 10000 })).data;
  const entry = manifest.versions.find(v => v.id === version);
  if (!entry) throw new Error(`Версия ${version} не найдена`);
  const resp = await axios.get(entry.url, { timeout: 10000 });
  fs.mkdirSync(vd, { recursive: true });
  fs.writeFileSync(jp, JSON.stringify(resp.data, null, 2), 'utf8');
  return resp.data;
}

// ============================================================
// АССЕТЫ
// ============================================================

function computeSha1(fp) {
  return new Promise((res, rej) => {
    const h = crypto.createHash('sha1');
    fs.createReadStream(fp).on('data', d => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej);
  });
}

function downloadFileWithRetry(url, fp, retries = 3) {
  return new Promise(async (resolve) => {
    for (let i = 0; i < retries; i++) {
      try {
        await streamDownload(url, fp, { timeout: 60000 });
        const stat = fs.statSync(fp);
        if (stat.size > 0) { resolve(true); return; }
      } catch (e) {
        if (fs.existsSync(fp)) try { fs.unlinkSync(fp); } catch (x) {}
        if (i < retries - 1) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
    resolve(false);
  });
}

async function downloadAllAssets(mp, sendProgress) {
  const ad = path.join(launcherDir, 'assets');
  const id = path.join(ad, 'indexes');
  const ip = path.join(id, `${mp.id}.json`);
  if (!fs.existsSync(ip) && mp.assetIndex?.url) {
    sendProgress({ status: 'assets', message: 'Скачивание индекса ассетов...' });
    fs.mkdirSync(id, { recursive: true });
    if (!(await downloadFileWithRetry(mp.assetIndex.url, ip, 5))) throw new Error('Не удалось скачать индекс ассетов');
  }
  if (!fs.existsSync(ip)) return;
  const index = JSON.parse(await fs.promises.readFile(ip, 'utf8'));
  const entries = Object.entries(index.objects || {});
  const total = entries.length;
  if (!total) return;
  sendProgress({ status: 'assets', message: `Скачивание ${total} ассетов...`, task: 0, total });
  for (let i = 0; i < entries.length; i += 10) {
    const batch = entries.slice(i, Math.min(i + 10, entries.length));
    await Promise.all(batch.map(async ([, info]) => {
      const hash = info.hash;
      const sub = hash.substring(0, 2);
      const p = path.join(ad, 'objects', sub, hash);
      if (fs.existsSync(p)) {
        try { if (fs.statSync(p).size === info.size) return; } catch (e) {}
      }
      const ok = await downloadFileWithRetry(`https://resources.download.minecraft.net/${sub}/${hash}`, p, 3);
      if (ok) {
        try {
          if ((await computeSha1(p)) !== hash) try { fs.unlinkSync(p); } catch (e) {}
        } catch (e) {}
      }
    }));
    sendProgress({ status: 'assets', message: `Ассеты: ${Math.min(i + 10, entries.length)}/${total}`, task: Math.min(i + 10, entries.length), total });
  }
}

// ============================================================
// ЗАПУСК
// ============================================================

let mainWindow = null;
let logWindow = null;
let gameRunning = false;
const logHistory = [];

function sendToLogWindow(type, data) {
  if (logWindow && !logWindow.isDestroyed()) logWindow.webContents.send(type, data);
}

function openLogWindow() {
  if (logWindow && !logWindow.isDestroyed()) { logWindow.focus(); return; }
  logWindow = new BrowserWindow({
    width: 700, height: 500, minWidth: 400, minHeight: 300,
    title: 'Лог запуска',
    autoHideMenuBar: true,
    backgroundColor: '#0d0d10',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  logWindow.setMenuBarVisibility(false);
  logWindow.loadFile('log.html');
  logWindow.webContents.on('did-finish-load', () => { sendToLogWindow('log-history', logHistory); });
  logWindow.on('closed', () => { logWindow = null; if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('log-window-closed'); });
}

let activeClient = null;

async function launchGame(username, profileData, selectedModIds) {
  await ensureDirectories();
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const { version, loader, instanceName } = profileData;
  const instanceDir = getInstanceDir(instanceName);
  const modsDir = getModsDir(instanceName);
  fs.mkdirSync(instanceDir, { recursive: true });
  fs.mkdirSync(modsDir, { recursive: true });

  const settings = loadSettings();

  try { await applySharedSettings(instanceName); } catch (e) {
    sendProgress({ status: 'sync-error', message: `Ошибка синхронизации: ${e.message}` });
  }

  function sendProgress(data) {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('launch-progress', data);
  }

  try {
    if (selectedModIds?.length > 0 && loader === 'fabric' && version === REDOX_VERSION) {
      sendProgress({ status: 'mods', message: 'Скачивание модов...' });
      const dl = new Set(selectedModIds);
      for (const m of selectedModIds) {
        const i = RECOMMENDED_MODS.find(x => x.id === m);
        if (i?.dependencies) i.dependencies.forEach(d => dl.add(d));
      }
      for (const m of dl) {
        try {
          await downloadRecommendedMod(m, instanceName);
          const i = RECOMMENDED_MODS.find(x => x.id === m);
          sendProgress({ status: 'mod-downloaded', message: `Скачан: ${i?.name || m}` });
        } catch (e) {
          sendProgress({ status: 'mod-error', message: `Ошибка ${m}: ${e.message}` });
        }
      }
    }

    sendProgress({ status: 'checking_java', message: 'Проверка Java...' });
    const javaPath = await ensureJava21();

    let mp;
    const is116x = version.startsWith('1.16.');
    const effectiveLoader = is116x && loader === 'vanilla' ? 'fabric' : loader;
    const vid = effectiveLoader === 'fabric' ? `${version}-fabric` : version;
    if (effectiveLoader === 'fabric') {
      sendProgress({ status: 'fetching_fabric', message: 'Fabric Loader...' });
      const lv = await fetchLatestFabricLoader(version);
      mp = await downloadFabricProfile(version, lv);

      if (is116x) {
        const multiOfflineFixUrl = 'https://github.com/MCTeamPotato/MultiOfflineFix/releases/download/1.0.3/MultiOfflineFix-fabric-1.0.3%2B1.16.4.jar';
        const multiOfflineFixPath = path.join(modsDir, 'MultiOfflineFix-fabric-1.0.3+1.16.4.jar');
        if (!fs.existsSync(multiOfflineFixPath)) {
          sendProgress({ status: 'mods', message: 'Установка фикса мультиплеера для 1.16.5...' });
          try {
            await streamDownload(multiOfflineFixUrl, multiOfflineFixPath, { timeout: 30000 });
            sendProgress({ status: 'mods', message: 'Фикс мультиплеера установлен' });
          } catch (fixErr) {
            sendProgress({ status: 'mods', message: `Не удалось скачать фикс: ${fixErr.message}` });
          }
        }
      }
    } else {
      sendProgress({ status: 'downloading_profile', message: `Скачивание ${version}...` });
      mp = await getVanillaVersionJson(version);
    }

    sendProgress({ status: 'downloading_assets', message: 'Проверка ассетов...' });
    await downloadAllAssets(mp, sendProgress);

    sendProgress({ status: 'launching', message: 'Запуск...' });

    const gpuArg = settings.gpu === 'integrated'
      ? '-Dforge.earlyWindowSkipGLVersions=core,compat'
      : settings.gpu === 'discrete'
        ? '-Dforge.earlyWindowControl=false'
        : '';

    const windowOpts = {};
    if (settings.windowWidth) windowOpts.width = parseInt(settings.windowWidth);
    if (settings.windowHeight) windowOpts.height = parseInt(settings.windowHeight);
    if (settings.fullscreen) windowOpts.fullscreen = true;

    const customArgs = gpuArg ? [gpuArg] : [];

    const gameDir = settings.gamePath || instanceDir;

    const options = {
      clientPackage: null,
      authorization: offlineAuth(username, version),
      root: gameDir,
      directory: path.join(versionsDir, vid),
      version: { number: vid, type: 'release', custom: vid },
      javaPath,
      memory: { max: `${settings.ram || 4}G`, min: '2G' },
      window: windowOpts,
      overrides: {
        versionJson: path.join(versionsDir, vid, `${vid}.json`),
        assetRoot: path.join(launcherDir, 'assets'),
        libraryDir: path.join(launcherDir, 'libraries'),
        versionDir: versionsDir,
        nativesDir: path.join(launcherDir, 'natives', vid)
      },
      customArgs
    };

    if (activeClient) { activeClient.removeAllListeners(); activeClient = null; }
    const client = new Client();
    activeClient = client;
    client.on('debug', (m) => sendProgress({ status: 'debug', message: m }));
    client.on('data', (d) => sendProgress({ status: 'data', message: d.toString() }));
    client.on('progress', (p) => sendProgress({ status: 'progress', ...p }));
    client.on('download', (n) => sendProgress({ status: 'download', message: n }));
    client.on('arguments', (args) => {
      sendProgress({ status: 'debug', message: `[LAUNCH] Полные аргументы Java: ${args.join(' ')}` });
    });
    client.on('close', (code) => {
      gameRunning = false;
      if (activeClient === client) { client.removeAllListeners(); activeClient = null; }
      sendProgress({ status: 'closed', exitCode: code });
      updateDiscordPresence('menu');
      if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); }
    });

    sendProgress({ status: 'debug', message: `[AUTH] meta.type=${options.authorization.meta.type}, uuid=${options.authorization.uuid}, name=${options.authorization.name}` });
    sendProgress({ status: 'debug', message: `[AUTH] versionJson=${options.overrides.versionJson}` });
    sendProgress({ status: 'debug', message: `[AUTH] gameDir=${options.root}` });
    sendProgress({ status: 'debug', message: `[AUTH] custom=${options.version.custom}, number=${options.version.number}` });
    sendProgress({ status: 'debug', message: `[LAUNCH] window: width=${windowOpts.width}, height=${windowOpts.height}, fullscreen=${windowOpts.fullscreen || false}` });

    await client.launch(options);
    gameRunning = true;
    sendProgress({ status: 'success', message: 'Игра запущена' });

    if (mainWindow && !mainWindow.isDestroyed()) {
      const onLaunch = settings.onLaunchAction || 'minimize';
      if (onLaunch === 'minimize') { mainWindow.minimize(); }
      else if (onLaunch === 'close') { mainWindow.hide(); }
    }

    if (instanceName.includes('RedoX') || version === REDOX_VERSION) {
      updateDiscordPresence('server');
    } else {
      updateDiscordPresence('singleplayer', version);
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      if (settings.closeOnLaunch) {
        mainWindow.destroy();
        app.quit();
      } else {
        mainWindow.hide();
      }
    }
  } catch (error) {
    console.error('Ошибка запуска:', error);
    sendProgress({ status: 'error', message: error.message });
    throw error;
  }
}

// ============================================================
// IPC
// ============================================================

ipcMain.handle('get-versions', async () => await fetchAllVersions());
ipcMain.handle('is-version-downloaded', async (e, v) => isVersionDownloaded(v));

ipcMain.handle('get-accounts', async () => loadAccounts());
ipcMain.handle('add-account', async (e, u) => {
  if (!u?.trim()) throw new Error('Введите никнейм');
  if (u.trim().length > 16) throw new Error('Максимум 16 символов');
  if (!/^[a-zA-Z0-9_]+$/.test(u.trim())) throw new Error('Только латиница, цифры и _');
  return addAccount(u.trim());
});
ipcMain.handle('remove-account', async (e, u) => removeAccount(u));

ipcMain.handle('get-custom-profiles', async () => loadCustomProfiles());
ipcMain.handle('add-custom-profile', async (e, name, version, loader) => {
  if (!name?.trim()) throw new Error('Введите имя');
  if (!version?.trim()) throw new Error('Выберите версию');
  return addCustomProfile(name.trim(), version.trim(), loader || 'vanilla');
});
ipcMain.handle('delete-custom-profile', async (e, id) => deleteCustomProfile(id));

ipcMain.handle('get-installed-mods', async (e, iname) => scanModsFolder(iname));
ipcMain.handle('toggle-mod', async (e, iname, fn) => toggleMod(iname, fn));
ipcMain.handle('remove-mod', async (e, iname, fn) => removeMod(iname, fn));
ipcMain.handle('open-mods-folder', async (e, iname) => {
  const d = getModsDir(iname);
  fs.mkdirSync(d, { recursive: true });
  await shell.openPath(d);
});

ipcMain.handle('show-in-folder', async (e, iname, fileName) => {
  const fp = path.join(getModsDir(iname), fileName);
  if (fs.existsSync(fp)) shell.showItemInFolder(fp);
});

ipcMain.handle('rename-mod', async (e, iname, oldName, newName) => {
  const d = getModsDir(iname);
  const oldPath = path.join(d, oldName);
  const newPath = path.join(d, newName);
  if (!fs.existsSync(oldPath)) throw new Error('Файл не найден');
  if (fs.existsSync(newPath)) throw new Error('Файл с таким именем уже существует');
  fs.renameSync(oldPath, newPath);
  return newName;
});

ipcMain.handle('copy-mod', async (e, iname, fileName) => {
  const d = getModsDir(iname);
  const src = path.join(d, fileName);
  if (!fs.existsSync(src)) throw new Error('Файл не найден');
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let dest;
  let i = 1;
  do {
    dest = path.join(d, `${base}_copy${i}${ext}`);
    i++;
  } while (fs.existsSync(dest));
  fs.copyFileSync(src, dest);
  return path.basename(dest);
});

ipcMain.handle('delete-mod', async (e, iname, fileName) => {
  const fp = path.join(getModsDir(iname), fileName);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  removeModFromManifestByFile(iname, fileName);
});

ipcMain.handle('download-addon', async (e, modId, instanceName) => {
  return await downloadRecommendedMod(modId, instanceName);
});

ipcMain.handle('remove-addon', async (e, modId, instanceName) => {
  removeRecommendedMod(modId, instanceName);
  return true;
});

ipcMain.handle('get-selected-profile', async () => getSelectedProfile());
ipcMain.handle('save-selected-profile', async (e, id) => saveSelectedProfile(id));

ipcMain.handle('get-settings', async () => loadSettings());
ipcMain.handle('save-settings', async (e, s) => { saveSettings(s); return s; });

ipcMain.on('change-launcher-size', (e, mode, w, h) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    if (mode === 'fullscreen') {
      mainWindow.maximize();
    } else {
      mainWindow.unmaximize();
      let width, height;
      if (mode === 'compact') { width = 960; height = 580; }
      else if (mode === 'hd') { width = 1280; height = 720; }
      else if (mode === 'custom') { width = parseInt(w) || 960; height = parseInt(h) || 580; }
      else { width = 960; height = 580; }
      mainWindow.setSize(width, height);
      mainWindow.center();
    }
  } catch (err) {
    console.error('change-launcher-size error:', err);
  }
});

ipcMain.handle('apply-shared-settings', async (e, instanceName) => {
  try {
    await applySharedSettings(instanceName);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-server-status', async () => await fetchServerStatus());

ipcMain.handle('launch-game', async (e, username, profileData, selectedModIds) => {
  if (!username?.trim()) throw new Error('Введите никнейм');
  await launchGame(username.trim(), profileData, selectedModIds || []);
  return { success: true };
});

ipcMain.handle('open-launcher-folder', async () => {
  await shell.openPath(launcherDir);
});

ipcMain.handle('open-external-url', async (e, url) => {
  if (url && typeof url === 'string') {
    await shell.openExternal(url);
  }
});

ipcMain.handle('open-game-folder', async (e, instanceName) => {
  const d = getInstanceDir(instanceName);
  fs.mkdirSync(d, { recursive: true });
  await shell.openPath(d);
});

ipcMain.handle('browse-folder', async (e, currentPath) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    defaultPath: currentPath || launcherDir,
    title: 'Выберите папку игры'
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// ============================================================
// АВАТАРЫ
// ============================================================

const avatarsDir = path.join(app.getPath('userData'), 'custom_avatars');

function ensureAvatarsDir() {
  if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });
}

function getAvatarPath(username) {
  return path.join(avatarsDir, `${username}.png`);
}

ipcMain.handle('get-avatar', async (e, username) => {
  if (!username) return null;
  const p = getAvatarPath(username);
  if (fs.existsSync(p)) return p;
  return null;
});

ipcMain.handle('select-avatar', async (e, username) => {
  if (!username) throw new Error('Никнейм не указан');
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg'] }],
    title: 'Выберите аватар'
  });
  if (result.canceled || !result.filePaths.length) return null;
  ensureAvatarsDir();
  const dest = getAvatarPath(username);
  fs.copyFileSync(result.filePaths[0], dest);
  return dest;
});

// ============================================================
// НАСТРОЙКИ ТЕМЫ (config.json в userData)
// ============================================================

const themeConfigPath = path.join(app.getPath('userData'), 'theme-config.json');

function loadThemeConfig() {
  try {
    if (fs.existsSync(themeConfigPath)) {
      return JSON.parse(fs.readFileSync(themeConfigPath, 'utf8'));
    }
  } catch (e) {}
  return { accent: '#FF6B35', bg: '#121214', panel: '#1e1e22', text: '#e4e4e7', muted: '#a1a5ad', effect: 'default', customThemes: [] };
}

function saveThemeConfig(cfg) {
  fs.writeFileSync(themeConfigPath, JSON.stringify(cfg, null, 2), 'utf8');
}

ipcMain.handle('get-theme-config', async () => loadThemeConfig());
ipcMain.handle('save-theme-config', async (e, cfg) => { saveThemeConfig(cfg); return true; });

// ============================================================
// MODRINTH API
// ============================================================

async function searchModrinth(query, categories = [], limit = 20, offset = 0, loader = null) {
  const filterFacets = [['project_type:mod']];

  if (loader) {
    filterFacets.push([`categories:${loader}`]);
  }

  if (categories.length > 0) {
    filterFacets.push(categories);
  }

  const params = new URLSearchParams({
    index: 'downloads',
    limit: limit,
    offset: offset,
    facets: JSON.stringify(filterFacets)
  });

  if (query && query.trim()) {
    params.set('query', query.trim());
  }

  const resp = await axios.get(`https://api.modrinth.com/v2/search?${params.toString()}`, {
    timeout: 15000,
    headers: {
      'User-Agent': 'LauncherRedoku/1.0.0 (contact@launcherredoku.dev)',
      'Accept-Encoding': 'gzip, deflate'
    }
  });
  return resp.data;
}

async function getModrinthVersions(projectId, version, loader) {
  const loaders = loader && loader !== 'vanilla' ? [loader] : ['fabric', 'forge'];
  const params = new URLSearchParams({
    loaders: JSON.stringify(loaders),
    game_versions: JSON.stringify([version])
  });

  const resp = await axios.get(`https://api.modrinth.com/v2/project/${projectId}/version?${params.toString()}`, { timeout: 15000 });
  return resp.data;
}

async function downloadModrinthMod(projectId, instanceName, version, loader) {
  const versions = await getModrinthVersions(projectId, version, loader);
  if (!Array.isArray(versions) || !versions.length) {
    throw new Error('Нет совместимых версий мода');
  }

  const modVersion = versions[0];
  const file = modVersion.files.find(f => f.file_type === 'release-fabric') || modVersion.files[0];
  if (!file?.url) {
    throw new Error('Не найден файл мода');
  }

  const modsDir = getModsDir(instanceName);
  fs.mkdirSync(modsDir, { recursive: true });
  const filePath = path.join(modsDir, file.filename);

  await streamDownload(file.url, filePath, { timeout: 120000 });

  const manifest = getModManifest(instanceName);
  manifest[projectId] = { fileName: file.filename, modName: modVersion.name || file.filename, source: 'modrinth' };
  saveModManifest(instanceName, manifest);

  return { filename: file.filename, size: file.size };
}

ipcMain.handle('modrinth-search', async (e, query, categories, limit, offset, loader) => {
  try {
    return await searchModrinth(query || '', categories || [], limit || 20, offset || 0, loader || null);
  } catch (err) {
    console.error('[Modrinth Search Error]', err.message);
    return { hits: [], error: err.message };
  }
});

ipcMain.handle('modrinth-download', async (e, projectId, instanceName, version, loader) => {
  return await downloadModrinthMod(projectId, instanceName, version, loader);
});

ipcMain.handle('get-mod-manifest', async (e, instanceName) => {
  return getModManifest(instanceName);
});

ipcMain.handle('add-mod-to-manifest', async (e, instanceName, projectId, fileName, modName, source) => {
  addModToManifest(instanceName, projectId, fileName, modName, source);
  return true;
});

ipcMain.handle('remove-mod-from-manifest', async (e, instanceName, projectId) => {
  removeModFromManifest(instanceName, projectId);
  return true;
});

ipcMain.handle('remove-modrinth-mod', async (e, projectId, instanceName) => {
  const manifest = getModManifest(instanceName);
  const entry = manifest[projectId];
  if (entry) {
    const modsDir = getModsDir(instanceName);
    const fp = path.join(modsDir, entry.fileName);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    const fpDisabled = fp + '.disabled';
    if (fs.existsSync(fpDisabled)) fs.unlinkSync(fpDisabled);
    removeModFromManifest(instanceName, projectId);
  }
  return true;
});

ipcMain.handle('drop-mods', async (e, instanceName, filePaths) => {
  const modsDir = getModsDir(instanceName);
  fs.mkdirSync(modsDir, { recursive: true });
  let copied = 0;
  for (const src of filePaths) {
    try {
      if (!fs.existsSync(src)) continue;
      const base = path.basename(src);
      if (!base.toLowerCase().endsWith('.jar')) continue;
      const dest = path.join(modsDir, base);
      fs.copyFileSync(src, dest);
      copied++;
    } catch (err) {
      console.error(`Ошибка копирования мода: ${err.message}`);
    }
  }
  return { copied };
});

ipcMain.handle('open-log-window', () => openLogWindow());
ipcMain.handle('send-log-line', (e, line) => { logHistory.push(line); if (logHistory.length > 500) logHistory.shift(); sendToLogWindow('log-line', line); });
ipcMain.handle('clear-log-history', () => { logHistory.length = 0; sendToLogWindow('log-clear', null); });
ipcMain.handle('get-log-history', () => { return logHistory; });

// ============================================================
// КАСТОМНЫЙ ТАЙТЛБАР: управление окном
// ============================================================

ipcMain.on('window-minimize', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize(); });
ipcMain.on('window-maximize', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize();
});
ipcMain.on('window-close', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close(); });
ipcMain.handle('window-is-maximized', () => { return mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false; });

// ============================================================
// ОКНО
// ============================================================

async function createWindow() {
  const settings = loadSettings();
  const lsm = settings.launcherSize || 'compact';
  let winW = 960, winH = 580;
  if (lsm === 'hd') { winW = 1280; winH = 720; }
  else if (lsm === 'custom') { winW = parseInt(settings.launcherWidth) || 960; winH = parseInt(settings.launcherHeight) || 580; }
  else if (lsm === 'compact') { winW = 960; winH = 580; }

  mainWindow = new BrowserWindow({
    width: winW, height: winH, minWidth: 800, minHeight: 500,
    frame: false,
    icon: path.join(__dirname, 'assets', 'logo.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
    autoHideMenuBar: true, backgroundColor: '#121214'
  });
  mainWindow.on('close', () => {
    if (rpc) { rpc.destroy().catch(() => {}); rpc = null; }
    if (serverTimer) { clearInterval(serverTimer); serverTimer = null; }
    app.quit();
  });
  mainWindow.on('maximize', () => { if (!mainWindow.isDestroyed()) mainWindow.webContents.send('window-maximize-change', true); });
  mainWindow.on('unmaximize', () => { if (!mainWindow.isDestroyed()) mainWindow.webContents.send('window-maximize-change', false); });
  mainWindow.loadFile('index.html');
  startServerMonitor(mainWindow);

  if (lsm === 'fullscreen') {
    mainWindow.once('ready-to-show', () => { mainWindow.maximize(); });
  }
}

function initAutoUpdater() {
  autoUpdater.logger = console;
  autoUpdater.on('checking-for-update', () => console.log('[UPDATER] Проверка обновлений...'));
  autoUpdater.on('update-available', (info) => console.log('[UPDATER] Доступно обновление:', info.version));
  autoUpdater.on('update-not-available', () => console.log('[UPDATER] Обновлений нет.'));
  autoUpdater.on('download-progress', (p) => console.log(`[UPDATER] Скачивание: ${Math.round(p.percent)}%`));
  autoUpdater.on('update-downloaded', () => {
    console.log('[UPDATER] Обновление скачано. Перезапуск...');
    autoUpdater.quitAndInstall();
  });
  autoUpdater.on('error', (e) => console.error('[UPDATER] Ошибка:', e));
  autoUpdater.checkForUpdatesAndNotify();
}

app.whenReady().then(async () => {
  await ensureDirectories();
  await createWindow();
  initDiscordRPC();
  initAutoUpdater();
  app.on('activate', async () => { if (!mainWindow || mainWindow.isDestroyed()) await createWindow(); else mainWindow.show(); });
});

ipcMain.handle('check-github-update', async () => {
  const resp = await axios.get('https://api.github.com/repos/redoku/RedoX/releases/latest', {
    headers: { 'User-Agent': 'RedoX' },
    timeout: 10000
  });
  const latest = resp.data;
  const latestVersion = (latest.tag_name || '').replace(/^v/, '');
  const currentVersion = app.getVersion();
  return { latestVersion, currentVersion, downloadUrl: latest.html_url, body: latest.body || '' };
});
app.on('before-quit', () => {
  if (serverTimer) { clearInterval(serverTimer); serverTimer = null; }
  if (rpc) { rpc.destroy().catch(() => {}); rpc = null; }
});

app.on('window-all-closed', () => {
  logWindow = null;
  if (rpc) { rpc.destroy().catch(() => {}); }
  if (process.platform !== 'darwin') app.quit();
});
