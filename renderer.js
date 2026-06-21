const REDOX_ID = 'redox-12111';
const REDOX_VERSION = '1.21.11';
const REDOX_NAME = '1.21.11 RedoX (Fabric)';

const state = {
  accounts: [],
  allVersions: [],
  customProfiles: [],
  selectedAccountId: null,
  selectedProfileId: REDOX_ID,
  selectedVersion: REDOX_VERSION,
  settings: {
    ram: 4, ramAuto: false,
    filterReleases: true, filterSnapshots: false, filterFabric: true, filterForge: true, filterOld: false,
    gamePath: '', windowWidth: 854, windowHeight: 480, fullscreen: false, gpu: 'auto',
    syncOptions: false, syncMods: false, syncSaves: false,
    syncResourcepacks: false, syncShaderpacks: false, syncServers: false,
    launcherSize: 'compact', launcherWidth: 960, launcherHeight: 580,
    glassMode: false,
    onLaunchAction: 'minimize',
    downloadSpeedLimit: 0
  },
  modsList: [],
  addonsEnabled: {},
  profileForDelete: null,
  isLaunching: false,
  logLines: [],
  gpuValue: 'auto',
  modrinthOffset: 0,
  modrinthQuery: '',
  modrinthHits: [],
  modrinthTotal: 0,
  modrinthManifest: {},
  modrinthCategories: []
};

function $(s) { return document.querySelector(s); }
function $$(s) { return document.querySelectorAll(s); }

function getInstanceName(profileId, version, loader) {
  if (profileId === REDOX_ID) return `${REDOX_VERSION}_RedoX`;
  const pr = state.customProfiles.find(p => p.id === profileId);
  const v = version || pr?.version || 'unknown';
  const l = loader || pr?.loader || 'vanilla';
  return `${v}_${l.charAt(0).toUpperCase() + l.slice(1)}`;
}

function getActiveInstanceName() {
  return getInstanceName(state.selectedProfileId);
}

function getActiveLoader() {
  if (state.selectedProfileId === REDOX_ID) return 'fabric';
  return state.customProfiles.find(p => p.id === state.selectedProfileId)?.loader || 'vanilla';
}

function getActiveVersion() {
  if (state.selectedProfileId === REDOX_ID) return REDOX_VERSION;
  return state.customProfiles.find(p => p.id === state.selectedProfileId)?.version || REDOX_VERSION;
}

function isRedoxProfile() {
  return state.selectedProfileId === REDOX_ID;
}

function hasAddonsSupport() {
  const version = getActiveVersion();
  const loader = getActiveLoader();
  return version === '1.21.11' && loader === 'fabric';
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

let _logScrollPending = false;
function addLog(text) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const line = `[${hh}:${mm}:${ss}] ${text}`;
  state.logLines.push(line);
  if (state.logLines.length > 200) state.logLines.shift();
  window.api.sendLogLine(line);
  const box = $('#log-box');
  if (box) {
    box.textContent = state.logLines.join('\n');
    if (!_logScrollPending) {
      _logScrollPending = true;
      requestAnimationFrame(() => {
        box.scrollTop = box.scrollHeight;
        _logScrollPending = false;
      });
    }
  }
}

function ramToMB(gb) { return gb * 1024; }

function updateRamDisplay() {
  const slider = $('#ram-slider');
  const val = parseInt(slider.value);
  const mb = ramToMB(val);
  $('#ram-value-box').value = mb;
  const pct = ((val - 1) / 15) * 100;
  slider.style.background = `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${pct}%, rgba(255,255,255,0.08) ${pct}%, rgba(255,255,255,0.08) 100%)`;
}

// ============================================================
// СЕРВЕР
// ============================================================

function updateServerUI(s) {
  const dot = $('#server-dot');
  const txt = $('#server-status-text');
  const det = $('#server-details');
  const ping = $('#server-ping');
  if (s.online) {
    dot.className = 'server-dot online';
    txt.textContent = `Онлайн: ${s.players} / ${s.max}`;
    det.textContent = s.version ? `Версия: ${s.version}` : '';
    if (ping) ping.textContent = s.ping ? `${s.ping}мс` : '';
  } else {
    dot.className = 'server-dot offline';
    txt.textContent = 'Неизвестно';
    det.textContent = '';
    if (ping) ping.textContent = '';
  }
}

// ============================================================
// ПРОФИЛИ
// ============================================================

function renderProfiles() {
  const list = $('#sidebar-profile-list');
  list.innerHTML = '';

  const rd = document.createElement('div');
  rd.className = 'dd-item' + (state.selectedProfileId === REDOX_ID ? ' active' : '');
  rd.dataset.id = REDOX_ID;
  rd.innerHTML = `<span>${REDOX_NAME}</span><span class="loader-tag fabric">FABRIC</span>`;
  list.appendChild(rd);

  for (const p of state.customProfiles) {
    const el = document.createElement('div');
    el.className = 'dd-item' + (state.selectedProfileId === p.id ? ' active' : '');
    el.dataset.id = p.id;
    const lc = p.loader === 'fabric' ? 'fabric' : p.loader === 'forge' ? 'forge' : 'vanilla';
    el.innerHTML = `<span>${p.name}</span>
      <span class="item-right">
        <span class="loader-tag ${lc}">${p.loader.toUpperCase()}</span>
        <button class="btn-del" data-id="${p.id}" title="Удалить"><svg class="close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </span>`;
    list.appendChild(el);
  }

  list.querySelectorAll('.btn-del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.profileForDelete = btn.dataset.id;
      const pr = state.customProfiles.find(p => p.id === btn.dataset.id);
      $('#delete-msg').textContent = `Удалить профиль «${pr?.name || ''}»?`;
      $('#delete-overlay').classList.remove('hidden');
    });
  });

  list.querySelectorAll('.dd-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-del')) return;
      selectProfile(el.dataset.id);
      closeAllDropdowns();
    });
  });

  updateProfileDisplay();
}

function updateProfileDisplay() {
  const isRedox = isRedoxProfile();
  const pr = isRedox ? null : state.customProfiles.find(p => p.id === state.selectedProfileId);
  const text = isRedox ? REDOX_NAME : (pr?.name || 'Неизвестный');
  $('#sidebar-profile-text').textContent = text;

  const addonsBtn = document.querySelector('.dock-btn[data-rail="addons"]');
  if (hasAddonsSupport()) {
    addonsBtn.style.display = '';
    addonsBtn.classList.remove('disabled');
  } else {
    addonsBtn.style.display = '';
    addonsBtn.classList.add('disabled');
  }

  if (!isRedox && pr) state.selectedVersion = pr.version;
  else if (isRedox) state.selectedVersion = REDOX_VERSION;

  refreshMods();
}

let syncCounter = 0;

function selectProfile(id) {
  state.selectedProfileId = id;
  state.modrinthManifest = {};
  window.api.saveSelectedProfile(id);
  renderProfiles();
  updatePlayButton();
  updateDashboard();
  updateModrinthProfileInfo();
  refreshModrinthInstallStates();
  const iname = getActiveInstanceName();
  const mySync = ++syncCounter;
  window.api.applySharedSettings(iname).then(r => {
    if (mySync !== syncCounter) return;
    if (r?.success) addLog('Синхронизация данных применена');
  }).catch(() => {});
}

// ============================================================
// АККАУНТЫ
// ============================================================

function renderAccounts() {
  const list = $('#sidebar-account-list');
  list.innerHTML = '';
  const railAvatar = $('#btn-rail-account');
  if (railAvatar) {
    const letter = (state.selectedAccountId || '?')[0].toUpperCase();
    const letterEl = railAvatar.querySelector('#rail-avatar-text');
    const imgEl = railAvatar.querySelector('#rail-avatar-img');
    if (letterEl) letterEl.textContent = letter;
    loadAvatarImage(state.selectedAccountId, imgEl, letterEl);
  }

  if (state.accounts.length === 0) {
    $('#sidebar-account-text').textContent = 'Нет аккаунтов';
    updatePlayButton();
    updateDashboard();
    return;
  }

  for (const a of state.accounts) {
    const el = document.createElement('div');
    el.className = 'dd-item' + (a === state.selectedAccountId ? ' active' : '');
    el.dataset.account = a;
    el.innerHTML = `<span>${a}</span><button class="btn-del acc-del" data-account="${a}" title="Удалить"><svg class="close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
    list.appendChild(el);
  }

  if (!state.selectedAccountId && state.accounts.length) state.selectedAccountId = state.accounts[0];
  const cur = state.selectedAccountId || state.accounts[0];
  $('#sidebar-account-text').textContent = cur || 'Нет аккаунтов';

  list.querySelectorAll('.dd-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('acc-del')) { e.stopPropagation(); return; }
      state.selectedAccountId = el.dataset.account;
      renderAccounts();
      updatePlayButton();
      updateFlyout();
      closeAllDropdowns();
    });
  });

  list.querySelectorAll('.acc-del').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        state.accounts = await window.api.removeAccount(btn.dataset.account);
        if (state.selectedAccountId === btn.dataset.account) state.selectedAccountId = state.accounts[0] || null;
        renderAccounts();
        updatePlayButton();
        updateFlyout();
      } catch (err) { alert(err.message); }
    });
  });

  updatePlayButton();
  updateDashboard();
}

function loadAvatarImage(username, imgEl, letterEl) {
  if (!username || !window.api.getAvatar) {
    if (imgEl) imgEl.classList.add('hidden');
    if (letterEl) letterEl.style.display = '';
    return;
  }
  window.api.getAvatar(username).then(p => {
    if (p && imgEl) {
      imgEl.src = p + '?t=' + Date.now();
      imgEl.classList.remove('hidden');
      if (letterEl) letterEl.style.display = 'none';
    } else {
      if (imgEl) imgEl.classList.add('hidden');
      if (letterEl) letterEl.style.display = '';
    }
  }).catch(() => {
    if (imgEl) imgEl.classList.add('hidden');
    if (letterEl) letterEl.style.display = '';
  });
}

function updateFlyout() {
  const nick = state.selectedAccountId || '';
  const flyoutNick = $('#flyout-nickname');
  const flyoutLetter = $('#flyout-avatar-letter');
  const flyoutImg = $('#flyout-avatar-img');
  if (flyoutNick) flyoutNick.textContent = nick || 'Не выбран';
  if (flyoutLetter) flyoutLetter.textContent = (nick || '?')[0].toUpperCase();
  loadAvatarImage(nick, flyoutImg, flyoutLetter);
}

// ============================================================
// DROPDOWN
// ============================================================

function setupSidebarDropdown(selectedId, listId) {
  const sel = $(selectedId);
  const list = $(listId);
  sel.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = list.classList.contains('open');
    closeAllDropdowns();
    if (!isOpen) { list.classList.add('open'); sel.classList.add('open'); }
  });
}

function closeAllDropdowns() {
  $$('.sidebar-dropdown-list').forEach(l => l.classList.remove('open'));
  $$('.sidebar-dropdown-selected').forEach(s => s.classList.remove('open'));
  $$('.dd-list').forEach(l => l.classList.remove('open'));
  $$('.dd-selected').forEach(s => s.classList.remove('open'));
  const flyout = document.getElementById('account-flyout');
  if (flyout) flyout.classList.add('hidden');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.sidebar-dropdown') && !e.target.closest('.custom-dropdown') && !e.target.closest('.account-flyout') && !e.target.closest('#btn-rail-account')) closeAllDropdowns();
});

// ============================================================
// КНОПКА ИГРАТЬ
// ============================================================

function updatePlayButton() {
  const btn = $('#btn-play');
  const txt = $('#btn-play-text');
  if (state.isLaunching) { txt.textContent = 'Запуск...'; btn.disabled = true; return; }
  const noAccount = state.accounts.length === 0;
  const noVersion = !state.selectedVersion;
  txt.textContent = noAccount ? 'Добавьте аккаунт' : noVersion ? 'Выберите версию' : 'Играть';
  btn.disabled = noAccount || noVersion;
}

// ============================================================
// ТАБЫ (главные)
// ============================================================

function switchToTab(tabName) {
  $$('.dock-btn').forEach(b => b.classList.remove('active'));
  $$('.tab-content').forEach(x => x.classList.remove('active'));
  const btn = document.querySelector(`.dock-btn[data-rail="${tabName}"]`);
  if (btn) btn.classList.add('active');
  const el = document.getElementById('tab-' + tabName);
  if (el) el.classList.add('active');
  if (tabName === 'addons') renderAddons();

  if (tabName === 'settings') {
    document.body.classList.add('hide-dashboard');
  } else {
    document.body.classList.remove('hide-dashboard');
  }
}

function initTabs() {
  $$('.dock-btn[data-rail]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.rail;

      if (tab === 'addons' && !hasAddonsSupport()) {
        addLog('Дополнения доступны для профилей на версии 1.21.11 с Fabric');
        return;
      }

      if (tab === 'account') {
        $('#account-overlay').classList.remove('hidden');
        return;
      }

      if (tab === 'settings') {
        renderSettings();
      }

      switchToTab(tab);
      });
    });
  }

  function toggleLauncherCustomSize(show) {
    const el = $('#launcher-custom-size');
    if (el) el.classList.toggle('hidden', !show);
  }

  const lsSel = $('#launcher-size-selected');
  const lsList = $('#launcher-size-list');
  if (lsSel && lsList) {
    lsSel.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = lsList.classList.contains('open');
      closeAllDropdowns();
      if (!isOpen) { lsList.classList.add('open'); lsSel.classList.add('open'); }
    });

    lsList.querySelectorAll('.dd-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        state.launcherSize = item.dataset.value;
        state.settings.launcherSize = item.dataset.value;
        const lsLabels = { compact: 'Компактный (960×580)', hd: 'Стандартный HD (1280×720)', fullscreen: 'На весь экран', custom: 'Пользовательский' };
        $('#launcher-size-text').textContent = lsLabels[item.dataset.value] || lsLabels.compact;
        lsList.querySelectorAll('.dd-item').forEach(x => x.classList.remove('active'));
        item.classList.add('active');
        lsList.classList.remove('open');
        lsSel.classList.remove('open');
        toggleLauncherCustomSize(item.dataset.value === 'custom');
      });
    });
  }

  const lwInput = $('#set-launcher-width');
  const lhInput = $('#set-launcher-height');
  if (lwInput) lwInput.addEventListener('change', () => { state.launcherWidth = parseInt(lwInput.value) || 1280; });
  if (lhInput) lhInput.addEventListener('change', () => { state.launcherHeight = parseInt(lhInput.value) || 800; });

function initHomeTab() {
  updateDashboard();
}

function updateDashboard() {
  updatePlayButton();
}

// ============================================================
// DRAG-AND-DROP ДЛЯ МОДОВ
// ============================================================

function initDragAndDrop() {
  const zone = $('#mods-drop-zone');
  const overlay = $('#drop-overlay');
  if (!zone || !overlay) return;

  let dragCounter = 0;

  zone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    overlay.classList.add('visible');
  });

  zone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      overlay.classList.remove('visible');
    }
  });

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    overlay.classList.remove('visible');

    const files = [];
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      for (const f of e.dataTransfer.files) {
        if (f.path && f.path.toLowerCase().endsWith('.jar')) {
          files.push(f.path);
        }
      }
    }

    if (files.length === 0) {
      addLog('Нет .jar файлов для установки');
      return;
    }

    const instanceName = getActiveInstanceName();
    addLog(`Установка ${files.length} мод(ов)...`);

    try {
      const result = await window.api.dropMods(instanceName, files);
      addLog(`Установлено: ${result.copied} из ${files.length}`);
      await refreshMods();
    } catch (err) {
      addLog(`Ошибка установки: ${err.message}`);
    }
  });
}

// ============================================================
// МОДЫ
// ============================================================

function cleanModName(filename) {
  return filename
    .replace(/\.jar\.disabled$/i, '')
    .replace(/\.disabled$/i, '')
    .replace(/\.jar$/i, '');
}

async function refreshMods() {
  const list = $('#mods-list');
  const iname = getActiveInstanceName();
  try { state.modsList = await window.api.getInstalledMods(iname); }
  catch (e) { state.modsList = []; }

  let manifest = {};
  try { manifest = await window.api.getModManifest(iname); } catch (e) {}

  const manifestByFile = {};
  for (const [pid, entry] of Object.entries(manifest)) {
    if (entry.fileName) manifestByFile[entry.fileName] = entry;
  }

  list.innerHTML = '';
  if (state.modsList.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'mods-empty';
    msg.textContent = 'Модов пока нет. Перетащите .jar файлы или откройте папку.';
    list.appendChild(msg);
    return;
  }

  for (const m of state.modsList) {
    const row = document.createElement('div');
    row.className = 'mod-row';
    row.dataset.fileName = m.name;

    const manifestEntry = manifestByFile[m.name];

    const name = document.createElement('div');
    name.className = 'mod-name' + (m.enabled ? '' : ' disabled');
    name.textContent = cleanModName(m.name);

    if (manifestEntry?.source === 'modrinth') {
      const badge = document.createElement('span');
      badge.className = 'mod-source-badge';
      badge.textContent = 'Modrinth';
      name.appendChild(badge);
    }

    const right = document.createElement('div');
    right.className = 'mod-right';

    const moreBtn = document.createElement('div');
    moreBtn.className = 'mod-more-btn';
    moreBtn.textContent = '···';
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showModContextMenu(e.clientX, e.clientY, m.name, iname);
    });

    const size = document.createElement('span');
    size.className = 'mod-size';
    size.textContent = formatSize(m.size);

    const toggle = document.createElement('div');
    toggle.className = 'toggle' + (m.enabled ? ' on' : '');

    toggle.addEventListener('click', async () => {
      try {
        const result = await window.api.toggleMod(iname, m.name);
        m.name = result.name;
        m.enabled = result.enabled;
        row.dataset.fileName = result.name;
        toggle.classList.toggle('on', result.enabled);
        name.classList.toggle('disabled', !result.enabled);
        name.childNodes[0].textContent = cleanModName(result.name);
        addLog(`${result.enabled ? 'Включён' : 'Выключен'}: ${cleanModName(result.name)}`);
      } catch (e) { addLog(`Ошибка: ${e.message}`); }
    });

    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showModContextMenu(e.clientX, e.clientY, m.name, iname);
    });

    right.appendChild(moreBtn);
    right.appendChild(size);
    right.appendChild(toggle);
    row.appendChild(name);
    row.appendChild(right);
    list.appendChild(row);
  }

  syncAddonStates();
  filterMods();
}

function filterMods() {
  const query = ($('#mods-search-input')?.value || '').toLowerCase();
  const rows = $$('#mods-list .mod-row');
  for (const row of rows) {
    const name = (row.dataset.fileName || '').toLowerCase();
    row.style.display = (!query || name.includes(query)) ? '' : 'none';
  }
}

async function resyncModsList() {
  const iname = getActiveInstanceName();
  try { state.modsList = await window.api.getInstalledMods(iname); }
  catch (e) { state.modsList = []; }
}

// ============================================================
// MOD CONTEXT MENU
// ============================================================

let ctxModFileName = '';
let ctxModInstance = '';

function showModContextMenu(x, y, fileName, instanceName) {
  ctxModFileName = fileName;
  ctxModInstance = instanceName;
  const menu = $('#mod-context-menu');
  menu.classList.remove('hidden');

  let mx = x, my = y;
  const rect = menu.getBoundingClientRect();
  if (mx + rect.width > window.innerWidth) mx = window.innerWidth - rect.width - 4;
  if (my + rect.height > window.innerHeight) my = window.innerHeight - rect.height - 4;
  menu.style.left = mx + 'px';
  menu.style.top = my + 'px';
}

function hideModContextMenu() {
  $('#mod-context-menu').classList.add('hidden');
}

function initModContextMenu() {
  document.addEventListener('click', (e) => {
    if (!$('#mod-context-menu').contains(e.target)) hideModContextMenu();
  });

  $('#mod-context-menu').addEventListener('click', async (e) => {
    const item = e.target.closest('.context-menu-item');
    if (!item) return;
    const action = item.dataset.action;
    hideModContextMenu();

    if (action === 'show-in-folder') {
      try { await window.api.showInFolder(ctxModInstance, ctxModFileName); }
      catch (e) { addLog(`Ошибка: ${e.message}`); }
    } else if (action === 'rename') {
      showRenameModal(ctxModFileName, ctxModInstance);
    } else if (action === 'duplicate') {
      try {
        const newName = await window.api.copyMod(ctxModInstance, ctxModFileName);
        addLog(`Копия создана: ${newName}`);
        refreshMods();
      } catch (e) { addLog(`Ошибка: ${e.message}`); }
    } else if (action === 'delete') {
      try {
        await window.api.deleteMod(ctxModInstance, ctxModFileName);
        addLog(`Удалён: ${ctxModFileName}`);
        refreshMods();
      } catch (e) { addLog(`Ошибка: ${e.message}`); }
    }
  });
}

function showRenameModal(currentName, instanceName) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';

  const box = document.createElement('div');
  box.className = 'overlay-box';
  box.innerHTML = `
    <div class="overlay-head">
      <span>Переименовать мод</span>
      <button class="overlay-x"><svg class="close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="overlay-body">
      <input type="text" class="text-input" id="rename-mod-input" value="${currentName}" maxlength="100">
      <button class="btn-create" id="rename-mod-confirm">Сохранить</button>
    </div>`;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const input = overlay.querySelector('#rename-mod-input');
  input.focus();
  input.select();

  const close = () => overlay.remove();
  overlay.querySelector('.overlay-x').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('#rename-mod-confirm').addEventListener('click', async () => {
    const newName = input.value.trim();
    if (!newName || newName === currentName) { close(); return; }
    try {
      await window.api.renameMod(instanceName, currentName, newName);
      addLog(`Переименован: ${currentName} → ${newName}`);
      close();
      refreshMods();
    } catch (e) { addLog(`Ошибка: ${e.message}`); }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') overlay.querySelector('#rename-mod-confirm').click();
    if (e.key === 'Escape') close();
  });
}

// ============================================================
// АДДОНЫ
// ============================================================

const ADDON_MODS = [
  {
    id: 'sodium',
    name: 'Sodium',
    icon: 'https://cdn.modrinth.com/data/AANobbMI/295862f4724dc3f78df3447ad6072b2dcd3ef0c9_96.webp',
    desc: 'Оптимизация графики и производительности. Критически важен для стабильного FPS с Distant Horizons или Voxy.',
    url: 'https://modrinth.com/mod/sodium',
    modrinthId: 'AANobbMI',
    dependencies: [],
    conflicts: []
  },
  {
    id: 'distant-horizons',
    name: 'Distant Horizons',
    icon: 'https://cdn.modrinth.com/data/uCdwusMi/e716cda9bb568b5373ff76e363fb4c6d7278fba6_96.webp',
    desc: 'Отрисовка бесконечных чанков через LOD-системы. Работает вместе с Sodium для максимальной производительности.',
    url: 'https://modrinth.com/mod/distanthorizons',
    modrinthId: 'uCdwusMi',
    dependencies: ['sodium'],
    conflicts: ['voxy']
  },
  {
    id: 'voxy',
    name: 'Voxy',
    icon: 'https://cdn.modrinth.com/data/fxxUqruK/2a4159b1ff6ecba43bf895d6abee6f724a0e03c0_96.webp',
    desc: 'Альтернативный воксельный движок отрисовки дальних чанков. Не совместим с Distant Horizons.',
    url: 'https://modrinth.com/mod/voxy',
    modrinthId: 'fxxUqruK',
    dependencies: ['sodium', 'fabric-api'],
    conflicts: ['distant-horizons']
  },
  {
    id: 'plasmo-voice',
    name: 'Plasmo Voice',
    icon: 'https://cdn.modrinth.com/data/1bZhdhsH/72c1641d4af92d93546958a2c87e0b5fd1c3f650_96.webp',
    desc: 'Внутриигровой объёмный голосовой чат с поддержкой 3D-позиционирования звука.',
    url: 'https://modrinth.com/mod/plasmo-voice',
    modrinthId: '1bZhdhsH',
    dependencies: ['fabric-api'],
    conflicts: []
  },
  {
    id: 'emotecraft',
    name: 'Emotecraft',
    icon: 'https://cdn.modrinth.com/data/pZ2wrerK/eed7e2c9851392e5879c7d7cb763f142f124e6d2_96.webp',
    desc: 'Уникальные анимации и эмоции персонажа. Выражайте себя в игре!',
    url: 'https://modrinth.com/mod/emotecraft',
    modrinthId: 'pZ2wrerK',
    dependencies: ['fabric-api', 'player-animation-library'],
    conflicts: []
  },
  {
    id: 'voxy-server-side',
    name: 'Voxy Server Side',
    icon: 'https://cdn.modrinth.com/data/84zcagOb/8f13eacb45ff56be05d77190237cd7d159cb136f.png',
    desc: 'Используйте вместе с Voxy. Без этого мода на сервере у игроков будет медленнее прогрузка дальних чанков — LOD-данные не кэшируются на стороне сервера.',
    url: 'https://modrinth.com/mod/voxy-server-side',
    modrinthId: '84zcagOb',
    dependencies: ['fabric-api'],
    conflicts: []
  }
];

const CONFLICT_PAIRS = [
  ['distant-horizons', 'voxy']
];

function getConflictMessage(addonId) {
  for (const pair of CONFLICT_PAIRS) {
    const idx = pair.indexOf(addonId);
    if (idx !== -1) {
      const otherId = pair[1 - idx];
      const other = ADDON_MODS.find(m => m.id === otherId);
      return other ? `Конфликтует с ${other.name}` : null;
    }
  }
  return null;
}

function isAddonInstalled(addonId) {
  const iname = getActiveInstanceName();
  const mods = state.modsList || [];
  const addon = ADDON_MODS.find(m => m.id === addonId);
  if (!addon) return false;
  return mods.some(m => {
    const lower = m.name.toLowerCase();
    return (lower.includes(addonId.replace(/-/g, '')) || lower.includes(addonId)) && m.enabled;
  });
}

function isAddonDisabled(addonId) {
  const mods = state.modsList || [];
  return mods.some(m => {
    const lower = m.name.toLowerCase();
    return (lower.includes(addonId.replace(/-/g, '')) || lower.includes(addonId)) && !m.enabled;
  });
}

function syncAddonStates() {
  for (const m of ADDON_MODS) {
    const hasEnabled = isAddonInstalled(m.id);
    const hasDisabled = isAddonDisabled(m.id);
    state.addonsEnabled[m.id] = hasEnabled;

    const card = document.querySelector(`#addon-card-${m.id}`);
    if (!card) continue;
    const tog = card.querySelector('.toggle');
    if (!tog) continue;

    if (hasEnabled) {
      tog.classList.add('on');
    } else {
      tog.classList.remove('on');
    }

    if (hasDisabled && !hasEnabled) {
      const statusEl = card.querySelector('.addon-status');
      if (statusEl && !tog.classList.contains('blocked')) {
        statusEl.textContent = 'Установлен (выкл)';
      }
    }
  }
}

function renderAddons() {
  const grid = $('#addons-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const iname = getActiveInstanceName();
  const isVanilla = getActiveLoader() === 'vanilla' && !isRedoxProfile();

  for (const m of ADDON_MODS) {
    const enabled = !!state.addonsEnabled[m.id];
    const installed = isAddonInstalled(m.id);

    // Check if this mod is blocked by a conflict
    let blocked = false;
    let conflictMsg = '';
    if (!enabled) {
      for (const otherId of (m.conflicts || [])) {
        if (state.addonsEnabled[otherId]) {
          blocked = true;
          const other = ADDON_MODS.find(x => x.id === otherId);
          conflictMsg = `Конфликтует с ${other?.name || otherId}`;
          break;
        }
      }
    }

    const card = document.createElement('div');
    card.className = 'addon-card' + (enabled ? ' addon-active' : '');
    card.id = `addon-card-${m.id}`;

    const iconHtml = m.icon
      ? `<img class="addon-icon-img" src="${m.icon}" alt="${m.name}">`
      : `<svg class="addon-icon addon-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;

    card.innerHTML = `
      <div class="addon-top">
        <div class="addon-top-left">
          ${iconHtml}
          <span class="addon-name">${m.name}</span>
        </div>
        <a class="addon-site-link" data-url="${m.url}" title="Перейти на сайт">↗ сайт</a>
      </div>
      <div class="addon-desc">${m.desc}</div>
      <div class="addon-toggle-row">
        <div class="toggle${enabled ? ' on' : ''}${blocked ? ' blocked' : ''}" data-mod="${m.id}" ${blocked ? 'data-blocked="true"' : ''}></div>
        <span class="addon-status">${enabled ? 'Установлен' : blocked ? conflictMsg : isAddonDisabled(m.id) ? 'Установлен (выкл)' : 'Не установлен'}</span>
        ${blocked ? `<span class="addon-conflict-badge">${conflictMsg}</span>` : ''}
      </div>`;

    grid.appendChild(card);
  }

  // Site links
  grid.querySelectorAll('.addon-site-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const url = link.dataset.url;
      if (url) window.api.openExternalUrl(url);
    });
  });

  // Toggle handlers
  grid.querySelectorAll('.toggle').forEach(tog => {
    tog.addEventListener('click', async () => {
      if (tog.dataset.blocked === 'true') return;
      const modId = tog.dataset.mod;
      const modInfo = ADDON_MODS.find(x => x.id === modId);
      const iname = getActiveInstanceName();
      const wasEnabled = state.addonsEnabled[modId];

      if (wasEnabled) {
        // DISABLE
        state.addonsEnabled[modId] = false;
        tog.classList.remove('on');

        // Enable any conflicting mods that were blocked
        for (const pair of CONFLICT_PAIRS) {
          const idx = pair.indexOf(modId);
          if (idx !== -1) {
            const otherId = pair[1 - idx];
            const otherCard = grid.querySelector(`#addon-card-${otherId}`);
            if (otherCard) {
              const otherTog = otherCard.querySelector('.toggle');
              if (otherTog) {
                otherTog.dataset.blocked = 'false';
                otherTog.classList.remove('blocked');
              }
              const badge = otherCard.querySelector('.addon-conflict-badge');
              if (badge) badge.remove();
            }
          }
        }

        // Rename file to .disabled
        try {
          const mods = await window.api.getInstalledMods(iname);
          const match = mods.find(m => {
            const lower = m.name.toLowerCase();
            return (lower.includes(modId.replace(/-/g, '')) || lower.includes(modId)) && m.enabled;
          });
          if (match) {
            await window.api.toggleMod(iname, match.name);
            addLog(`Отключён: ${modInfo?.name || modId}`);
          } else {
            addLog(`Файл мода не найден или уже отключён: ${modInfo?.name || modId}`);
          }
        } catch (e) { addLog(`Ошибка отключения: ${e.message}`); }

        await resyncModsList();
        syncAddonStates();
        updateAddonStatuses(grid);

      } else {
        // ENABLE
        // Check conflicts
        for (const otherId of (modInfo?.conflicts || [])) {
          if (state.addonsEnabled[otherId]) {
            addLog(`Конфликт: ${modInfo.name} не совместим с ${otherId}`);
            return;
          }
        }

        state.addonsEnabled[modId] = true;
        tog.classList.add('on');

        // Block conflicting mods — also rename their files to .disabled
        for (const otherId of (modInfo?.conflicts || [])) {
          const otherCard = grid.querySelector(`#addon-card-${otherId}`);
          if (otherCard) {
            const otherTog = otherCard.querySelector('.toggle');
            if (otherTog) {
              otherTog.dataset.blocked = 'true';
              otherTog.classList.add('blocked');
              otherTog.classList.remove('on');
            }
            state.addonsEnabled[otherId] = false;
            let badge = otherCard.querySelector('.addon-conflict-badge');
            if (!badge) {
              badge = document.createElement('span');
              badge.className = 'addon-conflict-badge';
              otherCard.querySelector('.addon-toggle-row').appendChild(badge);
            }
            badge.textContent = `Конфликтует с ${modInfo.name}`;
            const statusEl = otherCard.querySelector('.addon-status');
            if (statusEl) statusEl.textContent = `Конфликтует с ${modInfo.name}`;

            // Actually rename conflicting mod's file to .disabled
            try {
              const mods = await window.api.getInstalledMods(iname);
              const conflictMatch = mods.find(m => {
                const lower = m.name.toLowerCase();
                return (lower.includes(otherId.replace(/-/g, '')) || lower.includes(otherId)) && m.enabled;
              });
              if (conflictMatch) {
                await window.api.toggleMod(iname, conflictMatch.name);
                addLog(`Конфликт: ${otherId} отключён (файл переименован)`);
              }
            } catch (e) { addLog(`Ошибка отключения конфликта: ${e.message}`); }
          }
        }

        // Check if mod file exists, download or enable
        try {
          const mods = await window.api.getInstalledMods(iname);

          const matchEnabled = mods.find(m => {
            const lower = m.name.toLowerCase();
            return (lower.includes(modId.replace(/-/g, '')) || lower.includes(modId)) && m.enabled;
          });
          const matchDisabled = mods.find(m => {
            const lower = m.name.toLowerCase();
            return (lower.includes(modId.replace(/-/g, '')) || lower.includes(modId)) && !m.enabled;
          });

          if (matchEnabled) {
            addLog(`Уже установлен и включён: ${modInfo?.name || modId}`);
          } else if (matchDisabled) {
            await window.api.toggleMod(iname, matchDisabled.name);
            addLog(`Включён: ${modInfo?.name || modId}`);
          } else {
            const statusEl = tog.closest('.addon-card')?.querySelector('.addon-status');
            if (statusEl) statusEl.textContent = 'Скачивание...';
            addLog(`Скачивание: ${modInfo?.name || modId}...`);
            await window.api.downloadAddon(modId, iname);
            addLog(`Установлен: ${modInfo?.name || modId}`);
            if (statusEl) statusEl.textContent = 'Установлен';
          }
        } catch (e) {
          addLog(`Ошибка установки: ${e.message}`);
          state.addonsEnabled[modId] = false;
          tog.classList.remove('on');
        }

        await resyncModsList();
        syncAddonStates();
        updateAddonStatuses(grid);
      }
    });
  });

  updateAddonStatuses(grid);
}

function updateAddonStatuses(grid) {
  if (!grid) grid = $('#addons-grid');
  if (!grid) return;

  for (const m of ADDON_MODS) {
    const card = grid.querySelector(`#addon-card-${m.id}`);
    if (!card) continue;
    const tog = card.querySelector('.toggle');
    const statusEl = card.querySelector('.addon-status');
    if (!tog || !statusEl) continue;

    const enabled = !!state.addonsEnabled[m.id];
    const blocked = tog.dataset.blocked === 'true';

    if (enabled) {
      statusEl.textContent = 'Установлен';
      card.classList.add('addon-active');
    } else if (blocked) {
      const conflictId = m.conflicts?.find(id => state.addonsEnabled[id]);
      const conflictMod = ADDON_MODS.find(x => x.id === conflictId);
      statusEl.textContent = `Конфликтует с ${conflictMod?.name || conflictId || ''}`;
      card.classList.remove('addon-active');
    } else if (isAddonDisabled(m.id)) {
      statusEl.textContent = 'Установлен (выкл)';
      card.classList.remove('addon-active');
    } else {
      statusEl.textContent = 'Не установлен';
      card.classList.remove('addon-active');
    }
  }
}

// ============================================================
// ПРОГРЕСС + ЛОГ
// ============================================================

function onProgress(d) {
  if (!d) return;
  if (d.status === 'debug' || d.status === 'data') { addLog(d.message); return; }
  if (d.status === 'download') return;

  const wrap = $('#progress-wrap');
  const label = $('#progress-label');
  const fill = $('#progress-fill');

  if (d.status === 'error') {
    addLog(`ОШИБКА: ${d.message}`);
    wrap.classList.add('hidden');
    state.isLaunching = false;
    updatePlayButton();
    return;
  }
  if (d.status === 'closed') {
    addLog(`Игра закрыта (код: ${d.exitCode || '?'})`);
    wrap.classList.add('hidden');
    state.isLaunching = false;
    updatePlayButton();
    return;
  }

  if (d.status === 'sync' || d.status === 'sync-error') {
    addLog(d.message);
    if (d.status === 'sync-error') addLog(`ОШИБКА СИНХРОНИЗАЦИИ: ${d.message}`);
    wrap.classList.remove('hidden');
    label.textContent = d.message;
    fill.style.width = '100%';
    setTimeout(() => { wrap.classList.add('hidden'); fill.style.width = '0%'; }, 500);
    return;
  }

  wrap.classList.remove('hidden');
  const messages = {
    'checking_java': 'Проверка Java...', 'fetching_fabric': 'Загрузка Fabric...',
    'downloading_profile': d.message || 'Скачивание...', 'downloading_assets': d.message || 'Ассеты...',
    'assets': d.message, 'mods': d.message, 'mod-downloaded': d.message, 'mod-error': d.message,
    'launching': 'Запуск игры...', 'success': 'Игра запущена!'
  };
  const msg = messages[d.status] || d.message || 'Загрузка...';
  label.textContent = msg;
  addLog(msg);
  if (d.status === 'assets' && d.total) fill.style.width = `${(d.task / d.total) * 100}%`;
  else if (d.status === 'success') { fill.style.width = '100%'; setTimeout(() => { wrap.classList.add('hidden'); fill.style.width = '0%'; }, 2000); }
  else fill.style.width = '50%';
}

// ============================================================
// НАСТРОЙКИ
// ============================================================

function renderSettings() {
  const s = state.settings;
  $('#set-gamepath').value = s.gamePath || '';
  $('#set-width').value = s.windowWidth || 854;
  $('#set-height').value = s.windowHeight || 480;
  $('#set-fullscreen').checked = !!s.fullscreen;
  $('#ram-slider').value = s.ram || 4;
  $('#set-ram-auto').checked = !!s.ramAuto;
  updateRamDisplay();

  state.gpuValue = s.gpu || 'auto';
  const gpuLabels = { auto: 'Авто (по умолчанию)', discrete: 'Дискретная (dedicated)', integrated: 'Встроенная (integrated)' };
  $('#gpu-text').textContent = gpuLabels[state.gpuValue] || gpuLabels.auto;
  $$('#gpu-list .dd-item').forEach(item => {
    item.classList.toggle('active', item.dataset.value === state.gpuValue);
  });

  state.modrinthLimit = s.modrinthLoadLimit || 20;
  $('#modrinth-text').textContent = state.modrinthLimit;
  $$('#modrinth-list .dd-item').forEach(item => {
    item.classList.toggle('active', parseInt(item.dataset.value) === state.modrinthLimit);
  });

  state.launcherSize = s.launcherSize || 'compact';
  state.launcherWidth = s.launcherWidth || 960;
  state.launcherHeight = s.launcherHeight || 580;
  state._lastAppliedSize = state.launcherSize;
  state._lastAppliedW = state.launcherWidth;
  state._lastAppliedH = state.launcherHeight;
  const lsLabels = { compact: 'Компактный (960×580)', hd: 'Стандартный HD (1280×720)', fullscreen: 'На весь экран', custom: 'Пользовательский' };
  $('#launcher-size-text').textContent = lsLabels[state.launcherSize] || lsLabels.compact;
  $$('#launcher-size-list .dd-item').forEach(item => {
    item.classList.toggle('active', item.dataset.value === state.launcherSize);
  });
  toggleLauncherCustomSize(state.launcherSize === 'custom');
  $('#set-launcher-width').value = state.launcherWidth;
  $('#set-launcher-height').value = state.launcherHeight;

  $$('.toggle-chip').forEach(chip => {
    const key = chip.dataset.filter;
    if (key && s[key] !== undefined) chip.classList.toggle('active', s[key]);
  });

  $('#set-close-on-launch').checked = !!s.closeOnLaunch;
  $('#set-show-log').checked = !!s.showLogDefault;
  $('#set-server-address').value = s.serverAddress || '5.83.140.210:25784';
  $('#set-sync-options').checked = !!s.syncOptions;
  $('#set-sync-mods').checked = !!s.syncMods;
  $('#set-sync-saves').checked = !!s.syncSaves;
  $('#set-sync-resourcepacks').checked = !!s.syncResourcepacks;
  $('#set-sync-shaderpacks').checked = !!s.syncShaderpacks;
  $('#set-sync-servers').checked = !!s.syncServers;

  const glassCheckbox = $('#setting-glass-mode');
  if (glassCheckbox) {
    glassCheckbox.checked = !!s.glassMode;
  }

  const onLaunchLabels = { minimize: 'Сворачивать лаунчер', close: 'Закрывать лаунчер', none: 'Ничего не делать' };
  state.onLaunchAction = s.onLaunchAction || 'minimize';
  $('#on-launch-text').textContent = onLaunchLabels[state.onLaunchAction] || onLaunchLabels.minimize;
  $$('#on-launch-list .dd-item').forEach(item => {
    item.classList.toggle('active', item.dataset.value === state.onLaunchAction);
  });

  const speedLabels = { 0: 'Без ограничений', 2: '2 МБ/с', 5: '5 МБ/с', 10: '10 МБ/с' };
  state.downloadSpeedLimit = s.downloadSpeedLimit || 0;
  $('#net-speed-text').textContent = speedLabels[state.downloadSpeedLimit] || speedLabels[0];
  $$('#net-speed-list .dd-item').forEach(item => {
    item.classList.toggle('active', parseInt(item.dataset.value) === state.downloadSpeedLimit);
  });
}

// ============================================================
// ТЕМЫ / КАСТОМИЗАЦИЯ ИНТЕРФЕЙСА
// ============================================================

const THEME_PRESETS = {
  'redoku': {
    id: 'redoku', name: 'Redoku',
    colors: { accent: '#FF6B35', bgMain: '#121214', bgPanel: '#1e1e22', textMain: '#e4e4e7', textMuted: '#a1a5ad' },
    effect: 'default', isFavorite: false
  },
  'enderman': {
    id: 'enderman', name: 'Магия Эндермена',
    colors: { accent: '#9D4EDD', bgMain: '#0d0a14', bgPanel: '#1a1528', textMain: '#e8e0f0', textMuted: '#8a7da6' },
    effect: 'stars', isFavorite: false
  },
  'cyberpunk': {
    id: 'cyberpunk', name: 'Киберпанк',
    colors: { accent: '#F72585', bgMain: '#0a0a12', bgPanel: '#16131e', textMain: '#f0e8f4', textMuted: '#9a8aa6' },
    effect: 'glow', isFavorite: false
  },
  'electric': {
    id: 'electric', name: 'Электрик',
    colors: { accent: '#3A86FF', bgMain: '#0a0e14', bgPanel: '#141a24', textMain: '#e8eef6', textMuted: '#7a90aa' },
    effect: 'stars', isFavorite: false
  },
  'mint': {
    id: 'mint', name: 'Мятный изумруд',
    colors: { accent: '#06D6A0', bgMain: '#0a1210', bgPanel: '#14201c', textMain: '#e0f0ea', textMuted: '#7aa698' },
    effect: 'snow', isFavorite: false
  },
  'amber': {
    id: 'amber', name: 'Янтарь',
    colors: { accent: '#FFB703', bgMain: '#121008', bgPanel: '#1e1a10', textMain: '#f0ecd8', textMuted: '#a69a70' },
    effect: 'default', isFavorite: false
  },
  'sakura': {
    id: 'sakura', name: 'Сакура',
    colors: { accent: '#FF85A1', bgMain: '#120a0e', bgPanel: '#1e1418', textMain: '#f4e8ee', textMuted: '#a68090' },
    effect: 'snow', isFavorite: false
  },
  'ruby': {
    id: 'ruby', name: 'Рубин',
    colors: { accent: '#E63946', bgMain: '#120a0a', bgPanel: '#1e1414', textMain: '#f0e0e0', textMuted: '#a67a7a' },
    effect: 'glow', isFavorite: false
  }
};

let currentActiveTheme = {
  colors: { accent: '#FF6B35', bgMain: '#121214', bgPanel: '#1e1e22', textMain: '#e4e4e7', textMuted: '#a1a5ad' },
  effect: 'default'
};

function updateCurrentActiveTheme(colors, effect) {
  currentActiveTheme.colors = { ...colors };
  currentActiveTheme.effect = effect || 'default';
}

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function readCurrentThemeFromCSS() {
  return {
    colors: {
      accent: getCssVar('--accent-color') || '#FF6B35',
      bgMain: getCssVar('--bg-main') || '#121214',
      bgPanel: getCssVar('--bg-panel') || '#1e1e22',
      textMain: getCssVar('--text-main') || '#e4e4e7',
      textMuted: getCssVar('--text-muted') || '#a1a5ad'
    },
    effect: currentActiveTheme.effect
  };
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function lightenHex(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const lr = Math.min(255, Math.round(r + (255 - r) * amount));
  const lg = Math.min(255, Math.round(g + (255 - g) * amount));
  const lb = Math.min(255, Math.round(b + (255 - b) * amount));
  return '#' + [lr, lg, lb].map(c => c.toString(16).padStart(2, '0')).join('');
}

function darkenHex(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const dr = Math.round(r * (1 - amount));
  const dg = Math.round(g * (1 - amount));
  const db = Math.round(b * (1 - amount));
  return '#' + [dr, dg, db].map(c => c.toString(16).padStart(2, '0')).join('');
}

function applyTheme(hex) {
  const { r, g, b } = hexToRgb(hex);
  const root = document.documentElement;
  root.style.setProperty('--accent-color', hex);
  root.style.setProperty('--accent-hover', lightenHex(hex, 0.22));
  root.style.setProperty('--accent-dark', darkenHex(hex, 0.18));
  root.style.setProperty('--accent-light', `rgba(${r},${g},${b},0.15)`);
  root.style.setProperty('--accent-border', `rgba(${r},${g},${b},0.45)`);
  root.style.setProperty('--accent-shadow', `rgba(${r},${g},${b},0.3)`);
  root.style.setProperty('--accent-faint', `rgba(${r},${g},${b},0.08)`);
  root.style.setProperty('--accent-ghost', `rgba(${r},${g},${b},0.12)`);
  root.style.setProperty('--accent-whisper', `rgba(${r},${g},${b},0.06)`);
}

function applyFullTheme(themeObj) {
  const c = themeObj.colors;
  applyTheme(c.accent);
  const root = document.documentElement;
  root.style.setProperty('--bg-main', c.bgMain);
  root.style.setProperty('--bg-dark', c.bgMain);
  document.documentElement.style.background = c.bgMain;
  root.style.setProperty('--bg-panel', c.bgPanel);
  root.style.setProperty('--bg-card', c.bgPanel);
  root.style.setProperty('--text-main', c.textMain);
  root.style.setProperty('--text', c.textMain);
  root.style.setProperty('--text-muted', c.textMuted);
  root.style.setProperty('--text-dim', c.textMuted);
  setCanvasEffect(themeObj.effect || 'default');
  document.body.classList.toggle('glass-mode', !!state.settings.glassMode);
}

function applyFullThemeAndSync(themeObj) {
  applyFullTheme(themeObj);
  updateCurrentActiveTheme(themeObj.colors, themeObj.effect);
}

function themeObjToConfig(t) {
  return { accent: t.colors.accent, bg: t.colors.bgMain, panel: t.colors.bgPanel, text: t.colors.textMain, muted: t.colors.textMuted, effect: t.effect || 'default' };
}

function configToThemeObj(cfg) {
  return {
    colors: { accent: cfg.accent || '#FF6B35', bgMain: cfg.bg || '#121214', bgPanel: cfg.panel || '#1e1e22', textMain: cfg.text || '#e4e4e7', textMuted: cfg.muted || '#a1a5ad' },
    effect: cfg.effect || 'default'
  };
}

function saveTheme(themeKey) {
  localStorage.setItem('rdk-theme', themeKey);
}

function loadTheme() {
  const saved = localStorage.getItem('rdk-theme');
  if (!saved) return 'redoku';

  if (THEME_PRESETS[saved]) {
    applyFullThemeAndSync(THEME_PRESETS[saved]);
    return saved;
  }

  if (/^#[0-9a-fA-F]{6}$/.test(saved)) {
    applyTheme(saved);
    return 'custom-' + saved;
  }

  return 'redoku';
}

function highlightActiveTheme(activeKey) {
  $$('.theme-preset').forEach(p => p.classList.remove('active'));
  const customWrap = $('.theme-custom-wrap');
  if (customWrap) customWrap.classList.remove('active');

  if (activeKey && activeKey.startsWith('custom-')) {
    if (customWrap) customWrap.classList.add('active');
  } else if (activeKey && THEME_PRESETS[activeKey]) {
    const el = document.querySelector(`.theme-preset[data-theme="${activeKey}"]`);
    if (el) el.classList.add('active');
  }
}

// ============================================================
// CUSTOM COLOR PICKER (HSV)
// ============================================================

function hsvToRgb(h, s, v) {
  let r, g, b;
  const i = Math.floor(h / 60) % 6;
  const f = h / 60 - Math.floor(h / 60);
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0, s = max === 0 ? 0 : d / max, v = max;
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }
  return { h, s, v };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

function hexToRgbObj(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 255, g: 107, b: 53 };
}

function initThemePicker() {
  let currentTheme = loadTheme();
  highlightActiveTheme(currentTheme);

  // --- Preset buttons ---
  $$('.theme-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.theme;
      const preset = THEME_PRESETS[key];
      if (!preset) return;
      applyFullThemeAndSync(preset);
      saveTheme(key);
      currentTheme = key;
      highlightActiveTheme(key);
    });
  });

  // --- Modal elements ---
  const overlay = $('#color-modal-overlay');
  const modal = $('#color-modal-window');
  const btnCustom = $('#btn-custom-color');
  const btnHistory = $('#btn-color-history');
  const tabs = $$('.color-tab');
  const panes = $$('.color-tab-pane');
  const svCanvas = $('#picker-sv-canvas');
  const svArea = $('#picker-sv-area');
  const svCursor = $('#picker-sv-cursor');
  const hueTrack = $('#picker-hue-track');
  const hueThumb = $('#picker-hue-thumb');
  const hexInput = $('#picker-hex');
  const rInput = $('#picker-r');
  const gInput = $('#picker-g');
  const bInput = $('#picker-b');
  const applyBtn = $('#picker-apply');
  const historyList = $('#color-history-list');
  const clearBtn = $('#btn-clear-history');

  if (!overlay || !btnCustom) return;

  let hue = 20, sat = 1, val = 1;
  let draggingSV = false;
  let draggingHue = false;

  // ===================== COLOR HISTORY =====================
  const HISTORY_KEY = 'rdk-color-history';
  const HISTORY_LIMIT = 20;

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
    catch { return []; }
  }

  function saveHistory(arr) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(arr));
  }

  function addToHistory(hex) {
    hex = hex.toUpperCase();
    let arr = loadHistory();
    // remove duplicate
    arr = arr.filter(c => c.hex !== hex);
    arr.unshift({ hex, favorite: false, id: Date.now() });
    // trim non-fav overflow
    if (arr.length > HISTORY_LIMIT) {
      const favs = arr.filter(c => c.favorite);
      const rest = arr.filter(c => !c.favorite).slice(0, HISTORY_LIMIT - favs.length);
      arr = [...favs, ...rest];
    }
    saveHistory(arr);
    renderHistory();
  }

  function renderHistory() {
    const arr = loadHistory();
    const activeHex = hexInput.value.toUpperCase();
    if (!historyList) return;

    if (arr.length === 0) {
      historyList.innerHTML = '<div class="color-history-empty">Нет сохранённых цветов</div>';
      return;
    }

    // favs first
    const sorted = [...arr].sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));

    historyList.innerHTML = sorted.map(c => `
      <div class="color-history-item${c.hex === activeHex ? ' active-color' : ''}" data-hex="${c.hex}" data-id="${c.id}">
        <div class="color-history-swatch" style="background:${c.hex}"></div>
        <span class="color-history-hex">${c.hex}</span>
        <button class="color-history-star${c.favorite ? ' fav' : ''}" data-action="fav" data-id="${c.id}" title="Избранное">★</button>
        <button class="color-history-del" data-action="del" data-id="${c.id}" title="Удалить">✕</button>
      </div>
    `).join('');
  }

  // Event delegation on history list
  if (historyList) {
    historyList.addEventListener('click', (e) => {
      const starBtn = e.target.closest('[data-action="fav"]');
      const delBtn = e.target.closest('[data-action="del"]');
      const item = e.target.closest('.color-history-item');

      if (starBtn) {
        e.stopPropagation();
        const id = Number(starBtn.dataset.id);
        let arr = loadHistory();
        const entry = arr.find(c => c.id === id);
        if (entry) entry.favorite = !entry.favorite;
        saveHistory(arr);
        renderHistory();
        return;
      }

      if (delBtn) {
        e.stopPropagation();
        const id = Number(delBtn.dataset.id);
        let arr = loadHistory();
        arr = arr.filter(c => c.id !== id);
        saveHistory(arr);
        renderHistory();
        return;
      }

      if (item) {
        const hex = item.dataset.hex;
        applyTheme(hex);
        saveTheme(hex);
        currentTheme = 'custom-' + hex;
        highlightActiveTheme(currentTheme);
        renderHistory();
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      saveHistory([]);
      renderHistory();
    });
  }

  // ===================== MODAL OPEN/CLOSE =====================
  function openModal(tab) {
    overlay.classList.add('modal-open');
    switchTab(tab || 'palette');
    syncPickerToCurrent();
  }

  function closeModal() {
    overlay.classList.remove('modal-open');
  }

  function switchTab(name) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    panes.forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
    if (name === 'history') renderHistory();
  }

  function syncPickerToCurrent() {
    let initHex = '#FF6B35';
    const saved = localStorage.getItem('rdk-theme');
    if (saved && saved.startsWith('#')) initHex = saved;
    else if (saved && THEME_PRESETS[saved]) initHex = THEME_PRESETS[saved].hex;
    const { r, g, b } = hexToRgbObj(initHex);
    const hsv = rgbToHsv(r, g, b);
    hue = hsv.h; sat = hsv.s; val = hsv.v;
    drawSVCanvas();
    updateFromHSV(false);
  }

  tabs.forEach(t => {
    t.addEventListener('click', () => switchTab(t.dataset.tab));
  });

  btnCustom.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openModal('palette');
  });

  btnHistory.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openModal('history');
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('modal-open')) closeModal();
  });

  // ===================== PICKER LOGIC =====================
  function rgbFromHSV() {
    return hsvToRgb(hue, sat, val);
  }

  function updateFromHSV(apply) {
    const { r, g, b } = rgbFromHSV();
    svCursor.style.left = (sat * 100) + '%';
    svCursor.style.top = ((1 - val) * 100) + '%';
    hueThumb.style.left = (hue / 360 * 100) + '%';
    hexInput.value = rgbToHex(r, g, b).toUpperCase();
    rInput.value = r;
    gInput.value = g;
    bInput.value = b;
    if (apply !== false) {
      applyTheme(rgbToHex(r, g, b));
    }
  }

  function drawSVCanvas() {
    const ctx = svCanvas.getContext('2d');
    const w = svCanvas.width, h = svCanvas.height;
    ctx.clearRect(0, 0, w, h);
    const base = hsvToRgb(hue, 1, 1);
    ctx.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
    ctx.fillRect(0, 0, w, h);
    const whiteGrad = ctx.createLinearGradient(0, 0, w, 0);
    whiteGrad.addColorStop(0, 'rgba(255,255,255,1)');
    whiteGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = whiteGrad;
    ctx.fillRect(0, 0, w, h);
    const blackGrad = ctx.createLinearGradient(0, 0, 0, h);
    blackGrad.addColorStop(0, 'rgba(0,0,0,0)');
    blackGrad.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = blackGrad;
    ctx.fillRect(0, 0, w, h);
  }

  function setFromSVClick(e) {
    const rect = svArea.getBoundingClientRect();
    sat = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    val = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    updateFromHSV();
  }

  function setFromHueClick(e) {
    const rect = hueTrack.getBoundingClientRect();
    hue = Math.max(0, Math.min(359, ((e.clientX - rect.left) / rect.width) * 360));
    drawSVCanvas();
    updateFromHSV();
  }

  svArea.addEventListener('mousedown', (e) => {
    e.preventDefault();
    draggingSV = true;
    setFromSVClick(e);
  });

  hueTrack.addEventListener('mousedown', (e) => {
    e.preventDefault();
    draggingHue = true;
    setFromHueClick(e);
  });

  let _pickerRafPending = false;
  document.addEventListener('mousemove', (e) => {
    if (!draggingSV && !draggingHue) return;
    if (_pickerRafPending) return;
    _pickerRafPending = true;
    requestAnimationFrame(() => {
      if (draggingSV) setFromSVClick(e);
      if (draggingHue) setFromHueClick(e);
      _pickerRafPending = false;
    });
  });

  document.addEventListener('mouseup', () => {
    if (draggingSV || draggingHue) {
      const { r, g, b } = rgbFromHSV();
      const hex = rgbToHex(r, g, b);
      saveTheme(hex);
      currentTheme = 'custom-' + hex;
    }
    draggingSV = false;
    draggingHue = false;
  });

  hexInput.addEventListener('change', () => {
    let v = hexInput.value.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      const { r, g, b } = hexToRgbObj(v);
      const hsv = rgbToHsv(r, g, b);
      hue = hsv.h; sat = hsv.s; val = hsv.v;
      drawSVCanvas();
      updateFromHSV();
      saveTheme(v);
      currentTheme = 'custom-' + v;
      highlightActiveTheme(currentTheme);
    }
  });

  [rInput, gInput, bInput].forEach(inp => {
    inp.addEventListener('change', () => {
      const r = parseInt(rInput.value) || 0;
      const g = parseInt(gInput.value) || 0;
      const b = parseInt(bInput.value) || 0;
      const hex = rgbToHex(r, g, b);
      const hsv = rgbToHsv(r, g, b);
      hue = hsv.h; sat = hsv.s; val = hsv.v;
      drawSVCanvas();
      updateFromHSV(false);
      hexInput.value = hex.toUpperCase();
      applyTheme(hex);
      saveTheme(hex);
      currentTheme = 'custom-' + hex;
      highlightActiveTheme(currentTheme);
    });
  });

  // Apply button — add to history
  applyBtn.addEventListener('click', () => {
    const hex = hexInput.value.trim().toUpperCase();
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      applyTheme(hex);
      saveTheme(hex);
      currentTheme = 'custom-' + hex;
      highlightActiveTheme(currentTheme);
      addToHistory(hex);
    }
  });
}

// ============================================================
// НАСТРОЙКИ
// ============================================================

function initSettings() {
  $$('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.settings-tab').forEach(x => x.classList.remove('active'));
      $$('.settings-tab-content').forEach(x => x.classList.remove('active'));
      tab.classList.add('active');
      const el = document.getElementById('stab-' + tab.dataset.stab);
      if (el) el.classList.add('active');
    });
  });

  $$('.toggle-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('active');
      const key = chip.dataset.filter;
      if (key) state.settings[key] = chip.classList.contains('active');
    });
  });

  $('#ram-slider').addEventListener('input', () => updateRamDisplay());
  $('#ram-slider').addEventListener('change', () => { state.settings.ram = parseInt($('#ram-slider').value); });

  const ramInput = $('#ram-value-box');
  if (ramInput) {
    ramInput.addEventListener('input', () => {
      const mb = parseInt(ramInput.value) || 0;
      const gb = Math.round(mb / 1024);
      if (gb >= 1 && gb <= 16) {
        $('#ram-slider').value = gb;
        state.settings.ram = gb;
      }
    });
    ramInput.addEventListener('change', () => {
      const mb = parseInt(ramInput.value) || 0;
      const gb = Math.max(1, Math.min(16, Math.round(mb / 1024)));
      state.settings.ram = gb;
      $('#ram-slider').value = gb;
      ramInput.value = gb * 1024;
    });
  }

  $('#set-ram-auto').addEventListener('change', () => { state.settings.ramAuto = $('#set-ram-auto').checked; });
  $('#set-fullscreen').addEventListener('change', () => { state.settings.fullscreen = $('#set-fullscreen').checked; });
  $('#set-width').addEventListener('change', () => { state.settings.windowWidth = parseInt($('#set-width').value) || 854; });
  $('#set-height').addEventListener('change', () => { state.settings.windowHeight = parseInt($('#set-height').value) || 480; });

  const glassToggle = $('#setting-glass-mode');
  if (glassToggle) {
    glassToggle.addEventListener('change', () => {
      state.settings.glassMode = glassToggle.checked;
      document.body.classList.toggle('glass-mode', glassToggle.checked);
    });
  }

  const onLaunchSel = $('#on-launch-selected');
  const onLaunchList = $('#on-launch-list');
  if (onLaunchSel && onLaunchList) {
    onLaunchSel.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = onLaunchList.classList.contains('open');
      closeAllDropdowns();
      if (!isOpen) { onLaunchList.classList.add('open'); onLaunchSel.classList.add('open'); }
    });
    onLaunchList.querySelectorAll('.dd-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        state.onLaunchAction = item.dataset.value;
        state.settings.onLaunchAction = item.dataset.value;
        const labels = { minimize: 'Сворачивать лаунчер', close: 'Закрывать лаунчер', none: 'Ничего не делать' };
        $('#on-launch-text').textContent = labels[item.dataset.value] || labels.minimize;
        onLaunchList.querySelectorAll('.dd-item').forEach(x => x.classList.remove('active'));
        item.classList.add('active');
        onLaunchList.classList.remove('open');
        onLaunchSel.classList.remove('open');
      });
    });
  }

  const netSpeedSel = $('#net-speed-selected');
  const netSpeedList = $('#net-speed-list');
  if (netSpeedSel && netSpeedList) {
    netSpeedSel.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = netSpeedList.classList.contains('open');
      closeAllDropdowns();
      if (!isOpen) { netSpeedList.classList.add('open'); netSpeedSel.classList.add('open'); }
    });
    netSpeedList.querySelectorAll('.dd-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        state.downloadSpeedLimit = parseInt(item.dataset.value) || 0;
        state.settings.downloadSpeedLimit = state.downloadSpeedLimit;
        const labels = { 0: 'Без ограничений', 2: '2 МБ/с', 5: '5 МБ/с', 10: '10 МБ/с' };
        $('#net-speed-text').textContent = labels[state.downloadSpeedLimit] || labels[0];
        netSpeedList.querySelectorAll('.dd-item').forEach(x => x.classList.remove('active'));
        item.classList.add('active');
        netSpeedList.classList.remove('open');
        netSpeedSel.classList.remove('open');
      });
    });
  }

  $('#btn-browse-path').addEventListener('click', async () => {
    const p = await window.api.browseFolder(state.settings.gamePath || '');
    if (p) { state.settings.gamePath = p; $('#set-gamepath').value = p; }
  });

  const gpuSel = $('#gpu-selected');
  const gpuList = $('#gpu-list');
  gpuSel.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = gpuList.classList.contains('open');
    closeAllDropdowns();
    if (!isOpen) { gpuList.classList.add('open'); gpuSel.classList.add('open'); }
  });

  gpuList.querySelectorAll('.dd-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      state.gpuValue = item.dataset.value;
      state.settings.gpu = item.dataset.value;
      const gpuLabels = { auto: 'Авто (по умолчанию)', discrete: 'Дискретная (dedicated)', integrated: 'Встроенная (integrated)' };
      $('#gpu-text').textContent = gpuLabels[item.dataset.value] || gpuLabels.auto;
      gpuList.querySelectorAll('.dd-item').forEach(x => x.classList.remove('active'));
      item.classList.add('active');
      gpuList.classList.remove('open');
      gpuSel.classList.remove('open');
    });
  });

  const mrSel = $('#modrinth-selected');
  const mrList = $('#modrinth-list');
  if (mrSel && mrList) {
    mrSel.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = mrList.classList.contains('open');
      closeAllDropdowns();
      if (!isOpen) { mrList.classList.add('open'); mrSel.classList.add('open'); }
    });

    mrList.querySelectorAll('.dd-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        state.modrinthLimit = parseInt(item.dataset.value) || 20;
        state.settings.modrinthLoadLimit = state.modrinthLimit;
        $('#modrinth-text').textContent = state.modrinthLimit;
        mrList.querySelectorAll('.dd-item').forEach(x => x.classList.remove('active'));
        item.classList.add('active');
        mrList.classList.remove('open');
        mrSel.classList.remove('open');
      });
    });
  }

  $('#btn-settings-save').addEventListener('click', async () => {
    state.settings.ram = parseInt($('#ram-slider').value);
    state.settings.ramAuto = $('#set-ram-auto').checked;
    state.settings.gamePath = $('#set-gamepath').value;
    state.settings.windowWidth = parseInt($('#set-width').value) || 854;
    state.settings.windowHeight = parseInt($('#set-height').value) || 480;
    state.settings.fullscreen = $('#set-fullscreen').checked;
    state.settings.gpu = state.gpuValue;
    state.settings.closeOnLaunch = $('#set-close-on-launch').checked;
    state.settings.showLogDefault = $('#set-show-log').checked;
    state.settings.serverAddress = $('#set-server-address').value.trim() || '5.83.140.210:25784';
    state.settings.syncOptions = $('#set-sync-options').checked;
    state.settings.syncMods = $('#set-sync-mods').checked;
    state.settings.syncSaves = $('#set-sync-saves').checked;
    state.settings.syncResourcepacks = $('#set-sync-resourcepacks').checked;
    state.settings.syncShaderpacks = $('#set-sync-shaderpacks').checked;
    state.settings.syncServers = $('#set-sync-servers').checked;
    state.settings.modrinthLoadLimit = state.modrinthLimit || 20;
    state.settings.glassMode = $('#setting-glass-mode').checked;
    state.settings.onLaunchAction = state.onLaunchAction || 'minimize';
    state.settings.downloadSpeedLimit = state.downloadSpeedLimit || 0;
    $$('.toggle-chip').forEach(chip => {
      const key = chip.dataset.filter;
      if (key) state.settings[key] = chip.classList.contains('active');
    });
    await window.api.saveSettings(state.settings);
    const prev = { size: state._lastAppliedSize, w: state._lastAppliedW, h: state._lastAppliedH };
    const curr = { size: state.launcherSize, w: state.launcherWidth, h: state.launcherHeight };
    if (prev.size !== curr.size || prev.w !== curr.w || prev.h !== curr.h) {
      window.api.changeLauncherSize(curr.size, curr.w, curr.h);
      state._lastAppliedSize = curr.size;
      state._lastAppliedW = curr.w;
      state._lastAppliedH = curr.h;
    }
    addLog('Настройки сохранены');
  });

  $('#btn-settings-default').addEventListener('click', async () => {
    state.settings = {
      ram: 4, ramAuto: false,
      filterReleases: true, filterSnapshots: false, filterFabric: true, filterForge: true, filterOld: false,
      gamePath: '', windowWidth: 854, windowHeight: 480, fullscreen: false, gpu: 'auto',
      closeOnLaunch: false, showLogDefault: false, serverAddress: '5.83.140.210:25784',
      syncOptions: false, syncMods: false, syncSaves: false,
    syncResourcepacks: false, syncShaderpacks: false, syncServers: false,
      modrinthLoadLimit: 20,
      launcherSize: 'compact', launcherWidth: 960, launcherHeight: 580,
      glassMode: false,
      onLaunchAction: 'minimize',
      downloadSpeedLimit: 0
    };
    state.gpuValue = 'auto';
    state.launcherSize = 'compact';
    state.launcherWidth = 960;
    state.launcherHeight = 580;
    state._lastAppliedSize = 'compact';
    state._lastAppliedW = 960;
    state._lastAppliedH = 580;
    document.body.classList.remove('glass-mode');
    await window.api.saveSettings(state.settings);
    window.api.changeLauncherSize('compact', 960, 580);
    renderSettings();
    addLog('Настройки сброшены');
  });
}

// ============================================================
// СОЗДАНИЕ ПРОФИЛЯ
// ============================================================

function initProfileCreate() {
  let createVersion = '';

  $('#btn-add-profile').addEventListener('click', () => {
    $('#profile-name-input').value = '';
    $$('.pill').forEach(p => p.classList.remove('active'));
    $$('.pill')[0].classList.add('active');
    createVersion = '';
    renderCreateDropdown();
    $('#profile-overlay').classList.remove('hidden');
  });

  $('#profile-close').addEventListener('click', () => $('#profile-overlay').classList.add('hidden'));
  $('#profile-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden'); });

  $$('.pill').forEach(p => {
    p.addEventListener('click', () => { $$('.pill').forEach(x => x.classList.remove('active')); p.classList.add('active'); });
  });

  $('#btn-create-profile').addEventListener('click', async () => {
    const name = $('#profile-name-input').value.trim();
    const loader = $('.pill.active')?.dataset.loader || 'vanilla';
    if (!name) return alert('Введите имя профиля');
    if (!createVersion) return alert('Выберите версию');
    try {
      await window.api.addCustomProfile(name, createVersion, loader);
      state.customProfiles = await window.api.getCustomProfiles();
      selectProfile(state.customProfiles[state.customProfiles.length - 1].id);
      $('#profile-overlay').classList.add('hidden');
      addLog(`Создан профиль: ${name} (${createVersion} ${loader})`);
    } catch (e) { alert(e.message); }
  });

  function renderCreateDropdown() {
    const list = $('#create-version-list');
    const sel = $('#create-version-selected');
    const s = state.settings;

    const filtered = state.allVersions.filter(v => {
      if (v.type === 'release' && s.filterReleases) return true;
      if (v.type === 'snapshot' && s.filterSnapshots) return true;
      if ((v.type === 'old_beta' || v.type === 'old_alpha') && s.filterOld) return true;
      return false;
    });

    list.innerHTML = '';
    for (const v of filtered) {
      const el = document.createElement('div');
      el.className = 'dd-item';
      el.dataset.version = v.id;
      const badge = v.type === 'snapshot' ? '<span class="tag snap">SNAP</span>'
        : (v.type === 'old_beta' || v.type === 'old_alpha') ? '<span class="tag old">OLD</span>' : '';
      el.innerHTML = `<span>${v.id}</span>${badge}`;
      list.appendChild(el);
    }

    sel.querySelector('.sidebar-dropdown-text').textContent = createVersion || 'Выберите версию';

    list.querySelectorAll('.dd-item').forEach(el => {
      el.addEventListener('click', () => {
        createVersion = el.dataset.version;
        sel.querySelector('.sidebar-dropdown-text').textContent = createVersion;
        list.classList.remove('open');
        sel.classList.remove('open');
      });
    });

    sel.onclick = (e) => {
      e.stopPropagation();
      const isOpen = list.classList.contains('open');
      closeAllDropdowns();
      if (!isOpen) { list.classList.add('open'); sel.classList.add('open'); }
    };
  }
}

// ============================================================
// УДАЛЕНИЕ ПРОФИЛЯ
// ============================================================

function initDelete() {
  $('#delete-close').addEventListener('click', () => $('#delete-overlay').classList.add('hidden'));
  $('#delete-cancel').addEventListener('click', () => $('#delete-overlay').classList.add('hidden'));
  $('#delete-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden'); });
  $('#delete-confirm').addEventListener('click', async () => {
    if (state.profileForDelete) {
      try {
        await window.api.deleteCustomProfile(state.profileForDelete);
        state.customProfiles = await window.api.getCustomProfiles();
        if (state.selectedProfileId === state.profileForDelete) selectProfile(REDOX_ID);
        state.profileForDelete = null;
        renderProfiles();
        addLog('Профиль удалён');
      } catch (e) { alert(e.message); }
      $('#delete-overlay').classList.add('hidden');
    }
  });
}

// ============================================================
// АККАУНТЫ
// ============================================================

function initAccounts() {
  $('#btn-add-account').addEventListener('click', () => { $('#account-input').value = ''; $('#account-overlay').classList.remove('hidden'); });
  $('#account-close').addEventListener('click', () => $('#account-overlay').classList.add('hidden'));
  $('#account-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden'); });
  $('#account-confirm').addEventListener('click', async () => {
    const nick = $('#account-input').value.trim();
    if (!nick) return alert('Введите никнейм');
    try {
      state.accounts = await window.api.addAccount(nick);
      state.selectedAccountId = nick;
      renderAccounts();
      updateFlyout();
      $('#account-overlay').classList.add('hidden');
      addLog(`Аккаунт: ${nick}`);
    } catch (e) { alert(e.message); }
  });

  const accountBtn = $('#btn-rail-account');
  const flyout = $('#account-flyout');
  if (accountBtn && flyout) {
    accountBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = !flyout.classList.contains('hidden');
      closeAllDropdowns();
      if (!isOpen) {
        updateFlyout();
        flyout.classList.remove('hidden');
      }
    });
  }

  const changeAvatarBtn = $('#flyout-change-avatar');
  if (changeAvatarBtn) {
    changeAvatarBtn.addEventListener('click', async () => {
      const username = state.selectedAccountId;
      if (!username) return alert('Сначала выберите аккаунт');
      try {
        const result = await window.api.selectAvatar(username);
        if (result) {
          renderAccounts();
          updateFlyout();
          addLog(`Аватар обновлён: ${username}`);
        }
      } catch (e) { alert(e.message); }
    });
  }
}

// ============================================================
// КНОПКИ
// ============================================================

function initButtons() {
  const winMin = document.getElementById('win-min');
  const winMax = document.getElementById('win-max');
  const winClose = document.getElementById('win-close');

  if (winMin) winMin.addEventListener('click', () => window.api.minimizeWindow());
  if (winMax) winMax.addEventListener('click', () => window.api.maximizeWindow());
  if (winClose) winClose.addEventListener('click', () => window.api.closeWindow());

  if (window.api.onMaximizeChange) {
    window.api.onMaximizeChange((maximized) => {
      const btn = document.getElementById('win-max');
      if (!btn) return;
      if (maximized) {
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1.5" y="3.5" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/><polyline points="3.5,3.5 3.5,1.5 10.5,1.5 10.5,8.5 8.5,8.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        btn.title = 'Восстановить';
      } else {
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2" y="2" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>';
        btn.title = 'Развернуть';
      }
    });
  }

  const titlebar = document.getElementById('titlebar');
  if (titlebar) {
    titlebar.addEventListener('dblclick', (e) => {
      if (e.target.closest('.titlebar-controls')) return;
      window.api.maximizeWindow();
    });
  }

  $('#btn-play').addEventListener('click', startGame);
  $('#btn-folder-rail').addEventListener('click', () => window.api.openLauncherFolder());
  $('#btn-settings-folder')?.addEventListener('click', async () => {
    const p = await window.api.browseFolder(state.settings.gamePath || '');
    if (p) { state.settings.gamePath = p; $('#set-gamepath').value = p; }
  });
  $('#btn-open-mods-folder').addEventListener('click', () => window.api.openModsFolder(getActiveInstanceName()));
  $('#btn-refresh-mods').addEventListener('click', refreshMods);
  $('#btn-clear-log').addEventListener('click', () => { state.logLines = []; $('#log-box').textContent = ''; window.api.clearLogHistory(); });
  $('#btn-copy-log').addEventListener('click', () => {
    const text = state.logLines.join('\n');
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => addLog('Лог скопирован в буфер обмена'));
  });
  $('#btn-game-folder')?.addEventListener('click', () => window.api.openGameFolder(getActiveInstanceName()));

  const modsSearchInput = $('#mods-search-input');
  if (modsSearchInput) {
    modsSearchInput.addEventListener('input', filterMods);
  }

  // Collapsible log
  const logToggle = $('#log-toggle');
  const logBox = $('#log-box');
  const logHeader = $('#log-header');
  if (logBox) {
    logBox.addEventListener('transitionend', () => {
      if (!logBox.classList.contains('collapsed')) {
        logBox.style.overflowY = 'auto';
      }
    });
  }
  if (logHeader && logBox) {
    logHeader.addEventListener('click', (e) => {
      if (e.target.closest('#btn-copy-log') || e.target.closest('#btn-clear-log') || e.target.closest('#btn-expand-log')) return;
      const collapsing = !logBox.classList.contains('collapsed');
      logBox.classList.toggle('collapsed');
      if (collapsing) logBox.style.overflowY = 'hidden';
      logToggle.textContent = logBox.classList.contains('collapsed') ? 'Лог запуска ▸' : 'Лог запуска ▾';
    });
  }

  // Open log window
  const btnExpandLog = $('#btn-expand-log');
  if (btnExpandLog) {
    btnExpandLog.addEventListener('click', () => window.api.openLogWindow());
  }
}

// ============================================================
// ЗАПУСК
// ============================================================

async function startGame() {
  if (state.isLaunching) return;
  const username = state.selectedAccountId;
  if (!username) return;
  const version = state.selectedVersion;
  if (!version) return;

  state.isLaunching = true;
  updatePlayButton();

  const loader = getActiveLoader();
  const instanceName = getActiveInstanceName();
  addLog(`Запуск: ${username} | ${version} | ${loader}`);

  const profileData = { version, loader, instanceName };

  try {
    const selectedModIds = [];
    for (const [id, enabled] of Object.entries(state.addonsEnabled)) {
      if (enabled && id !== 'fabric-api' && id !== 'sodium') selectedModIds.push(id);
    }
    if (selectedModIds.length) {
      selectedModIds.push('fabric-api', 'sodium');
    }
    await window.api.launchGame(username, profileData, selectedModIds);
  } catch (e) {
    addLog(`Ошибка запуска: ${e.message}`);
    state.isLaunching = false;
    updatePlayButton();
    $('#progress-wrap').classList.add('hidden');
  }
}

// ============================================================
// MODRINTH
// ============================================================

function getActiveLoaderForModrinth() {
  if (state.selectedProfileId === REDOX_ID) return 'fabric';
  const pr = state.customProfiles.find(p => p.id === state.selectedProfileId);
  return pr?.loader || 'vanilla';
}

function updateModrinthProfileInfo() {
  const el = $('#modrinth-profile-info');
  if (!el) return;
  const version = getActiveVersion();
  const loader = getActiveLoaderForModrinth();
  const loaderLabel = loader === 'vanilla' ? 'Vanilla' : loader === 'fabric' ? 'Fabric' : 'Forge';
  el.textContent = `${version} ${loaderLabel}`;
}

async function loadModrinthManifest() {
  const iname = getActiveInstanceName();
  try { state.modrinthManifest = await window.api.getModManifest(iname); }
  catch (e) { state.modrinthManifest = {}; }
}

async function refreshModrinthInstallStates() {
  await loadModrinthManifest();
  const grid = $('#modrinth-grid');
  if (!grid || !state.modrinthHits.length) return;
  grid.innerHTML = '';
  renderModrinthResults(state.modrinthHits, false);
}

function renderModrinthResults(hits, append) {
  const grid = $('#modrinth-grid');
  const empty = $('#modrinth-empty');
  const loadMoreBtn = $('#modrinth-load-more');
  if (!grid) return;

  if (!append) {
    grid.innerHTML = '';
    state.modrinthHits = [];
  }

  if (!hits || hits.length === 0) {
    if (state.modrinthHits.length === 0) {
      empty.textContent = append ? 'Больше модов не найдено' : 'Ничего не найдено';
      empty.classList.remove('hidden');
    }
    if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  const loader = getActiveLoaderForModrinth();
  const canInstall = loader !== 'vanilla';

  state.modrinthHits = append ? [...state.modrinthHits, ...hits] : hits;
  if (state.modrinthHits.length > 200) {
    state.modrinthHits = state.modrinthHits.slice(-200);
  }

  const hasMore = state.modrinthHits.length < state.modrinthTotal;
  if (loadMoreBtn) {
    if (hasMore) {
      loadMoreBtn.classList.remove('hidden');
      loadMoreBtn.disabled = false;
      loadMoreBtn.textContent = `Показать ещё (${state.modrinthHits.length} из ${state.modrinthTotal})`;
    } else {
      loadMoreBtn.classList.add('hidden');
    }
  }

  const newCards = document.createDocumentFragment();
  for (const hit of hits) {
    const manifestEntry = state.modrinthManifest[hit.project_id];
    const isInstalled = !!manifestEntry;

    const card = document.createElement('div');
    card.className = 'modrinth-card';
    card.dataset.projectId = hit.project_id;

    const iconHtml = hit.icon_url
      ? `<img class="modrinth-card-icon" src="${hit.icon_url}" alt="${hit.title}">`
      : `<div class="modrinth-card-icon-placeholder"><svg class="close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>`;

    const downloads = hit.downloads ? hit.downloads.toLocaleString() : '0';

    let installBtnHtml;
    if (!canInstall) {
      installBtnHtml = `<button class="btn-install" disabled title="Для установки модов выберите профиль Fabric или Forge">Vanilla</button>`;
    } else if (isInstalled) {
      installBtnHtml = `<button class="btn-install installed" data-project="${hit.project_id}" data-slug="${hit.slug}" data-installed="true" title="Нажмите для удаления">Установлено</button>`;
    } else {
      installBtnHtml = `<button class="btn-install" data-project="${hit.project_id}" data-slug="${hit.slug}" title="Установить">Установить</button>`;
    }

    card.innerHTML = `
      ${iconHtml}
      <div class="modrinth-card-body">
        <div class="modrinth-card-header">
          <div class="modrinth-card-title">${hit.title}</div>
          <a class="addon-site-link" data-url="https://modrinth.com/mod/${hit.slug}" title="Перейти на сайт">↗ сайт</a>
        </div>
        <div class="modrinth-card-desc">${hit.description || 'Без описания'}</div>
        <div class="modrinth-card-footer">
          <span class="modrinth-card-downloads">↓ ${downloads}</span>
          ${installBtnHtml}
        </div>
      </div>`;

    newCards.appendChild(card);
  }

  grid.appendChild(newCards);
}

function initModrinth() {
  const searchInput = $('#modrinth-search-input');
  const searchBtn = $('#modrinth-search-btn');
  const grid = $('#modrinth-grid');
  const empty = $('#modrinth-empty');
  const loading = $('#modrinth-loading');
  const loadMoreBtn = $('#modrinth-load-more');
  const filterBtn = $('#modrinth-filter-btn');
  const filtersPanel = $('#modrinth-filters-panel');

  if (!searchInput || !searchBtn) return;

  function buildFacets() {
    const loader = getActiveLoaderForModrinth();
    const categories = [];

    for (const cat of state.modrinthCategories) {
      categories.push(`categories:${cat}`);
    }

    return { loader: (loader && loader !== 'vanilla') ? loader : null, categories };
  }

  async function doSearch(query, append) {
    if (!append) {
      state.modrinthOffset = 0;
      state.modrinthQuery = query || '';
      grid.innerHTML = '';
    }

    loading.classList.remove('hidden');
    if (!append) empty.classList.add('hidden');
    if (loadMoreBtn) loadMoreBtn.classList.add('hidden');

    try {
      await loadModrinthManifest();
      const { loader, categories } = buildFacets();
      const limit = state.settings.modrinthLoadLimit || 20;
      const data = await window.api.modrinthSearch(state.modrinthQuery, categories, limit, state.modrinthOffset, loader);
      loading.classList.add('hidden');
      if (data.error) {
        empty.textContent = `Ошибка Modrinth API: ${data.error}`;
        empty.classList.remove('hidden');
        return;
      }
      state.modrinthTotal = data.total_hits || 0;
      state.modrinthOffset += data.hits.length;
      renderModrinthResults(data.hits, append);
    } catch (e) {
      loading.classList.add('hidden');
      if (!append) {
        empty.textContent = `Ошибка: ${e.message}`;
        empty.classList.remove('hidden');
      }
    }
  }

  searchBtn.addEventListener('click', () => doSearch(searchInput.value.trim(), false));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch(searchInput.value.trim(), false);
  });

  let searchDebounce = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => doSearch(searchInput.value.trim(), false), 400);
  });

  if (filterBtn && filtersPanel) {
    filterBtn.addEventListener('click', () => {
      filtersPanel.classList.toggle('active');
      filterBtn.classList.toggle('active', filtersPanel.classList.contains('active'));
    });

    filtersPanel.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const tag = chip.dataset.tag;
        const idx = state.modrinthCategories.indexOf(tag);

        if (idx === -1) {
          state.modrinthCategories.push(tag);
          chip.classList.add('active');
        } else {
          state.modrinthCategories.splice(idx, 1);
          chip.classList.remove('active');
        }

        state.modrinthOffset = 0;
        state.modrinthHits = [];
        doSearch(state.modrinthQuery, false);
      });
    });
  }

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      loadMoreBtn.disabled = true;
      loadMoreBtn.textContent = 'Загрузка...';
      doSearch(state.modrinthQuery, true);
    });
  }

  // Event delegation: one handler for ALL clicks on the grid
  grid.addEventListener('click', async (e) => {
    const link = e.target.closest('.addon-site-link');
    if (link) {
      e.preventDefault();
      const url = link.dataset.url;
      if (url) window.api.openExternalUrl(url);
      return;
    }

    const btn = e.target.closest('.btn-install');
    if (!btn || btn.disabled) return;

    const projectId = btn.dataset.project;
    const slug = btn.dataset.slug;
    const isInstalled = btn.dataset.installed === 'true';

    if (isInstalled) {
      // --- UNINSTALL ---
      btn.textContent = '...';
      btn.disabled = true;
      try {
        const iname = getActiveInstanceName();
        await window.api.removeModrinthMod(projectId, iname);
        delete state.modrinthManifest[projectId];

        // Full state reset —回到 первозданному виду
        btn.disabled = false;
        btn.textContent = 'Установить';
        btn.classList.remove('installed');
        btn.removeAttribute('data-installed');
        btn.removeAttribute('title');
        btn.title = 'Установить';

        addLog(`Modrinth: мод ${slug} удалён`);
        await refreshMods();
      } catch (err) {
        addLog(`Modrinth ошибка: ${err.message}`);
        btn.disabled = false;
        btn.textContent = 'Установлено';
      }
    } else {
      // --- INSTALL ---
      btn.textContent = '...';
      btn.disabled = true;
      try {
        const instanceName = getActiveInstanceName();
        const version = getActiveVersion();
        const loader = getActiveLoaderForModrinth();
        const result = await window.api.modrinthDownload(projectId, instanceName, version, loader);
        state.modrinthManifest[projectId] = { fileName: result.filename, modName: slug, source: 'modrinth' };

        // Full state reset — переключить в "установлено"
        btn.disabled = false;
        btn.textContent = 'Установлено';
        btn.classList.add('installed');
        btn.dataset.installed = 'true';
        btn.title = 'Нажмите для удаления';

        addLog(`Modrinth: мод ${slug} установлен`);
        await refreshMods();
      } catch (err) {
        addLog(`Modrinth ошибка: ${err.message}`);
        btn.disabled = false;
        btn.textContent = 'Установить';
      }
    }
  });

  updateModrinthProfileInfo();

  const modrinthBtn = document.querySelector('.dock-btn[data-rail="modrinth"]');
  if (modrinthBtn) {
    modrinthBtn.addEventListener('click', () => {
      updateModrinthProfileInfo();
    });
  }

  doSearch('');
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================

// ============================================================
// СВОРАЧИВАНИЕ ПАНЕЛИ УПРАВЛЕНИЯ
// ============================================================

function initControlPanelToggle() {
  const panel = $('#control-panel');
  const toggleBtn = $('#cp-toggle-btn');
  const expandBtn = $('#cp-expand-btn');
  if (!panel || !toggleBtn || !expandBtn) return;

  function togglePanel() {
    const collapsed = panel.classList.toggle('collapsed');
    expandBtn.classList.toggle('hidden', !collapsed);
    toggleBtn.title = collapsed ? 'Развернуть панель (Ctrl+B)' : 'Свернуть панель (Ctrl+B)';
  }

  toggleBtn.addEventListener('click', togglePanel);
  expandBtn.addEventListener('click', togglePanel);

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      togglePanel();
    }
  });
}

async function init() {
  try {
    state.accounts = await window.api.getAccounts();
    state.allVersions = await window.api.getVersions();
    state.customProfiles = await window.api.getCustomProfiles();
    state.settings = await window.api.getSettings();
    const sel = await window.api.getSelectedProfile();
    state.selectedProfileId = sel?.id || REDOX_ID;

    const pr = state.selectedProfileId === REDOX_ID
      ? null
      : state.customProfiles.find(p => p.id === state.selectedProfileId);
    state.selectedVersion = pr ? pr.version : REDOX_VERSION;

    if (!state.selectedAccountId && state.accounts.length) state.selectedAccountId = state.accounts[0];

    renderProfiles();
    renderAccounts();
    updateFlyout();
    renderAddons();
    refreshMods();
    updatePlayButton();
    initTabs();
    initHomeTab();
    initSettings();
    initThemePicker();
    initAppearance();
    initProfileCreate();
    initDelete();
    initAccounts();
    initButtons();
    initDragAndDrop();
    initModrinth();
    initModContextMenu();
    initControlPanelToggle();
    setupSidebarDropdown('#sidebar-profile-selected', '#sidebar-profile-list');
    setupSidebarDropdown('#sidebar-account-selected', '#sidebar-account-list');

    $('#about-discord')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.api.openExternalUrl('https://dsc.gg/redokumc');
    });
    $('#about-github')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.api.openExternalUrl('https://github.com/redoku/RedoX');
    });
    $('#about-update')?.addEventListener('click', async (e) => {
      e.preventDefault();
      const status = $('#about-update-status');
      status.classList.remove('hidden', 'success', 'error');
      status.textContent = 'Проверка обновлений...';
      status.classList.remove('hidden');
      try {
        const info = await window.api.checkGithubUpdate();
        if (info.latestVersion && info.latestVersion !== info.currentVersion) {
          status.classList.add('success');
          status.textContent = `Доступна версия ${info.latestVersion} (у вас ${info.currentVersion})`;
          status.onclick = () => window.api.openExternalUrl(info.downloadUrl);
          status.style.cursor = 'pointer';
        } else {
          status.textContent = `У вас последняя версия (${info.currentVersion})`;
        }
      } catch (err) {
        status.classList.add('error');
        status.textContent = 'Не удалось проверить обновления';
      }
    });

    if (state.settings.glassMode) {
      document.body.classList.add('glass-mode');
    }

    if (!state.settings.showLogDefault) {
      const logBox = $('#log-box');
      const logToggle = $('#log-toggle');
      if (logBox) logBox.classList.add('collapsed');
      if (logToggle) logToggle.textContent = 'Лог запуска ▸';
    }

    window.api.onServerStatus(updateServerUI);
    window.api.onProgress(onProgress);
    window.api.getServerStatus();
    addLog('Лаунчер загружен');

    if (window.api.isMaximized) {
      window.api.isMaximized().then((max) => {
        const btn = document.getElementById('win-max');
        if (btn && max) {
          btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1.5" y="3.5" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/><polyline points="3.5,3.5 3.5,1.5 10.5,1.5 10.5,8.5 8.5,8.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
          btn.title = 'Восстановить';
        }
      }).catch(() => {});
    }
  } catch (e) { console.error('Init error:', e); }
}

document.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  init();
  initThemeSettings();
  initBgCanvas();
});

// ============================================================
// РАСШИРЕННЫЕ НАСТРОЙКИ ТЕМЫ
// ============================================================

function initThemeSettings() {
  const overlay = document.getElementById('theme-settings-overlay');
  const openBtn = document.getElementById('btn-appearance-custom');
  const closeBtn = document.getElementById('theme-settings-close');
  const cancelBtn = document.getElementById('theme-settings-cancel');
  const saveBtn = document.getElementById('theme-settings-save');
  const saveThemeBtn = document.getElementById('ts-save-theme');
  const themeNameInput = document.getElementById('ts-theme-name');
  const themeListEl = document.getElementById('theme-list');
  if (!overlay || !openBtn) return;

  const inputs = {
    accent: document.getElementById('ts-accent'),
    bg: document.getElementById('ts-bg'),
    panel: document.getElementById('ts-panel'),
    text: document.getElementById('ts-text'),
    muted: document.getElementById('ts-muted')
  };
  const vals = {
    accent: document.getElementById('ts-accent-val'),
    bg: document.getElementById('ts-bg-val'),
    panel: document.getElementById('ts-panel-val'),
    text: document.getElementById('ts-text-val'),
    muted: document.getElementById('ts-muted-val')
  };
  const swatches = {
    accent: document.getElementById('swatch-accent'),
    bg: document.getElementById('swatch-bg'),
    panel: document.getElementById('swatch-panel'),
    text: document.getElementById('swatch-text'),
    muted: document.getElementById('swatch-muted')
  };
  const effectSelect = document.getElementById('ts-effect');

  let themeSnapshotBeforeOpen = null;

  function applyLive(key, val) {
    const root = document.documentElement;
    if (key === 'accent') {
      root.style.setProperty('--accent-color', val);
      root.style.setProperty('--accent-hover', lightenHex(val, 0.22));
      root.style.setProperty('--accent-dark', darkenHex(val, 0.18));
      const { r, g, b } = hexToRgb(val);
      root.style.setProperty('--accent-light', `rgba(${r},${g},${b},0.15)`);
      root.style.setProperty('--accent-border', `rgba(${r},${g},${b},0.45)`);
      root.style.setProperty('--accent-shadow', `rgba(${r},${g},${b},0.3)`);
      root.style.setProperty('--accent-faint', `rgba(${r},${g},${b},0.08)`);
      root.style.setProperty('--accent-ghost', `rgba(${r},${g},${b},0.12)`);
      root.style.setProperty('--accent-whisper', `rgba(${r},${g},${b},0.06)`);
    } else if (key === 'bg') {
      root.style.setProperty('--bg-main', val);
      root.style.setProperty('--bg-dark', val);
      document.documentElement.style.background = val;
    } else if (key === 'panel') {
      root.style.setProperty('--bg-panel', val);
      root.style.setProperty('--bg-card', val);
    } else if (key === 'text') {
      root.style.setProperty('--text-main', val);
      root.style.setProperty('--text', val);
    } else if (key === 'muted') {
      root.style.setProperty('--text-muted', val);
      root.style.setProperty('--text-dim', val);
    }
  }

  function syncInputsFromTheme(themeObj) {
    const c = themeObj.colors;
    const map = { accent: c.accent, bg: c.bgMain, panel: c.bgPanel, text: c.textMain, muted: c.textMuted };
    for (const [key, val] of Object.entries(map)) {
      if (inputs[key]) inputs[key].value = val;
      if (swatches[key]) swatches[key].style.background = val;
      if (vals[key]) vals[key].textContent = val.toUpperCase();
    }
    if (effectSelect) effectSelect.value = themeObj.effect || 'default';
  }

  function readModalInputsAsThemeObj() {
    return {
      colors: {
        accent: inputs.accent?.value || '#FF6B35',
        bgMain: inputs.bg?.value || '#121214',
        bgPanel: inputs.panel?.value || '#1e1e22',
        textMain: inputs.text?.value || '#e4e4e7',
        textMuted: inputs.muted?.value || '#a1a5ad'
      },
      effect: effectSelect?.value || 'default'
    };
  }

  for (const [key, inp] of Object.entries(inputs)) {
    if (!inp) continue;
    inp.addEventListener('input', () => {
      const v = inp.value;
      if (swatches[key]) swatches[key].style.background = v;
      if (vals[key]) vals[key].textContent = v.toUpperCase();
      applyLive(key, v);
    });
  }

  async function loadCustomThemes() {
    let cfg = null;
    try { if (window.api.getThemeConfig) cfg = await window.api.getThemeConfig(); } catch (e) {}
    return cfg?.customThemes || [];
  }

  async function saveCustomThemes(themes) {
    let cfg = null;
    try { if (window.api.getThemeConfig) cfg = await window.api.getThemeConfig(); } catch (e) {}
    if (!cfg) cfg = {};
    cfg.customThemes = themes;
    try { if (window.api.saveThemeConfig) await window.api.saveThemeConfig(cfg); } catch (e) {}
  }

  function renderThemeList(themes) {
    if (!themeListEl) return;
    if (!themes.length) {
      themeListEl.innerHTML = '<div class="theme-list-empty">Нет сохранённых тем</div>';
      return;
    }
    const sorted = [...themes].sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
    themeListEl.innerHTML = sorted.map(t => {
      const favClass = t.isFavorite ? ' is-active' : '';
      const itemClass = t.isFavorite ? ' is-favorite' : '';
      return `<div class="theme-list-item${itemClass}" data-id="${t.id}">
        <div class="theme-list-swatch" style="background:${t.colors.accent}"></div>
        <span class="theme-list-name">${t.name}</span>
        <div class="theme-list-actions">
          <button class="theme-list-btn btn-apply" data-action="apply" title="Применить">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
          <button class="theme-list-btn btn-fav${favClass}" data-action="fav" title="Избранное">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="${t.isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </button>
          <button class="theme-list-btn btn-delete" data-action="delete" title="Удалить">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>`;
    }).join('');

    themeListEl.querySelectorAll('.theme-list-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const item = btn.closest('.theme-list-item');
        const id = item?.dataset.id;
        if (!id) return;
        const action = btn.dataset.action;
        let themes = await loadCustomThemes();
        const theme = themes.find(t => t.id === id);
        if (!theme) return;

        if (action === 'apply') {
          applyFullThemeAndSync(theme);
          syncInputsFromTheme(theme);
          saveTheme('custom-' + theme.id);
          highlightActiveTheme('custom-' + theme.id);
        } else if (action === 'fav') {
          theme.isFavorite = !theme.isFavorite;
          await saveCustomThemes(themes);
          renderThemeList(themes);
        } else if (action === 'delete') {
          themes = themes.filter(t => t.id !== id);
          await saveCustomThemes(themes);
          renderThemeList(themes);
        }
      });
    });
  }

  openBtn.addEventListener('click', async () => {
    themeSnapshotBeforeOpen = {
      colors: { ...currentActiveTheme.colors },
      effect: currentActiveTheme.effect
    };
    syncInputsFromTheme(currentActiveTheme);
    let cfg = null;
    try { if (window.api.getThemeConfig) cfg = await window.api.getThemeConfig(); } catch (e) {}
    const themes = cfg?.customThemes || [];
    renderThemeList(themes);
    overlay.classList.add('open');
  });

  function closeModal() { overlay.classList.remove('open'); }

  function restoreFromSnapshot() {
    if (!themeSnapshotBeforeOpen) return;
    applyFullTheme(themeSnapshotBeforeOpen);
    currentActiveTheme.colors = { ...themeSnapshotBeforeOpen.colors };
    currentActiveTheme.effect = themeSnapshotBeforeOpen.effect;
  }

  if (closeBtn) closeBtn.addEventListener('click', () => { restoreFromSnapshot(); closeModal(); });
  if (cancelBtn) cancelBtn.addEventListener('click', () => { restoreFromSnapshot(); closeModal(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { restoreFromSnapshot(); closeModal(); } });

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const themeObj = readModalInputsAsThemeObj();
      updateCurrentActiveTheme(themeObj.colors, themeObj.effect);
      const cfg = themeObjToConfig(themeObj);
      try { if (window.api.saveThemeConfig) await window.api.saveThemeConfig(cfg); } catch (e) {}
      applyFullTheme(themeObj);
      localStorage.setItem('rdk-theme', themeObj.colors.accent);
      themeSnapshotBeforeOpen = null;
      closeModal();
      addLog('Тема сохранена');
    });
  }

  if (saveThemeBtn) {
    saveThemeBtn.addEventListener('click', async () => {
      const name = themeNameInput?.value?.trim();
      if (!name) return;
      const themeObj = readModalInputsAsThemeObj();
      const newTheme = {
        id: 'custom-' + Date.now(),
        name: name,
        colors: themeObj.colors,
        effect: themeObj.effect,
        isFavorite: false
      };
      let themes = await loadCustomThemes();
      themes.push(newTheme);
      await saveCustomThemes(themes);
      renderThemeList(themes);
      if (themeNameInput) themeNameInput.value = '';
      addLog(`Тема «${name}» сохранена`);
    });
  }
}

// ============================================================
// APPEARANCE TAB — ГОТОВЫЕ ТЕМЫ (18 пресетов)
// ============================================================

const THEME_EFFECT_MAP = {
  'Магические светлячки': 'fireflies',
  'Частицы Края': 'void',
  'Галактический Алфавит': 'galactic',
  'Северное сияние': 'aurora',
  'Звездопад': 'stars',
  'Геометрическая сеть': 'plexus',
  'Снегопад': 'snow',
  'Адские искры': 'embers',
  'Лепестки Сакуры': 'petals',
  'Пузыри': 'bubbles',
  'Редстоун линии': 'redstone',
  'Пиксельный глитч': 'glitch',
  '3D Каркасные Кубы': 'cubes',
  'Дефолтные круги': 'default',
  'Выключен': 'none'
};

const APPEARANCE_PRESETS = [
  { id: 'redox-vanilla', name: 'RedoX Vanilla', accent: '#4ADE80', bg: '#0F141C', panel: '#1E2633', text: '#E2E8F0', muted: '#708096', effect: 'Магические светлячки' },
  { id: 'void-end', name: 'Кратум / End', accent: '#BB86FC', bg: '#0D0B14', panel: '#1A1629', text: '#F1EAFF', muted: '#8E7EAC', effect: 'Частицы Края' },
  { id: 'matrix-acid', name: 'Матрица', accent: '#34D399', bg: '#0A0F0D', panel: '#141F1A', text: '#ECFDF5', muted: '#6B7F74', effect: 'Галактический Алфавит' },
  { id: 'aurora-borealis', name: 'Северное Сияние', accent: '#22D3EE', bg: '#0B1317', panel: '#16252C', text: '#E0F2FE', muted: '#6A8491', effect: 'Северное сияние' },
  { id: 'nether-hell', name: 'Нижний Мир', accent: '#F87171', bg: '#140B0C', panel: '#241416', text: '#FEE2E2', muted: '#996B6D', effect: 'Адские искры' },
  { id: 'cyberpunk-neon', name: 'Киберпанк', accent: '#F43F5E', bg: '#0D0B18', panel: '#1A1630', text: '#FDF2F8', muted: '#8B7FA3', effect: '3D Каркасные Кубы' },
  { id: 'deep-ocean', name: 'Глубокий Океан', accent: '#38BDF8', bg: '#080F1D', panel: '#111E36', text: '#F0F9FF', muted: '#667B94', effect: 'Пузыри' },
  { id: 'sunset-glow', name: 'Закат над Тайгой', accent: '#FB923C', bg: '#14100E', panel: '#261F1A', text: '#FFF7ED', muted: '#948073', effect: 'Звездопад' },
  { id: 'amethyst-cave', name: 'Аметистовая Жеода', accent: '#C084FC', bg: '#0F0A1C', panel: '#1F1538', text: '#FAF5FF', muted: '#9083A8', effect: 'Геометрическая сеть' },
  { id: 'steampunk', name: 'Стимпанк', accent: '#F59E0B', bg: '#14110E', panel: '#241E19', text: '#FEF3C7', muted: '#8C8074', effect: '3D Каркасные Кубы' },
  { id: 'crimson-forest', name: 'Багровый Лес', accent: '#FB7185', bg: '#14080A', panel: '#261115', text: '#FFE4E6', muted: '#9E787D', effect: 'Адские искры' },
  { id: 'warped-forest', name: 'Искажённый Лес', accent: '#06B6D4', bg: '#081419', panel: '#12252E', text: '#E0F7FA', muted: '#6A858F', effect: 'Частицы Края' },
  { id: 'winter-ice', name: 'Вечная Мерзлота', accent: '#7DD3FC', bg: '#0A121A', panel: '#142230', text: '#F0F9FF', muted: '#758896', effect: 'Снегопад' },
  { id: 'midnight-luxe', name: 'Полуночный Люкс', accent: '#FBBF24', bg: '#0A0A0A', panel: '#161616', text: '#F3F4F6', muted: '#888888', effect: '3D Каркасные Кубы' },
  { id: 'toxic-bio', name: 'Биохазард', accent: '#A3E635', bg: '#0E120A', panel: '#1B2414', text: '#F7FEE7', muted: '#7B8570', effect: 'Пиксельный глитч' },
  { id: 'sakura-bloom', name: 'Цветение Сакуры', accent: '#F472B6', bg: '#170F11', panel: '#2B1B1F', text: '#FDF2F8', muted: '#9E8389', effect: 'Лепестки Сакуры' },
  { id: 'desert-dusk', name: 'Пески Времени', accent: '#FCD34D', bg: '#14120E', panel: '#242019', text: '#FEF3C7', muted: '#8C8576', effect: 'Дефолтные круги' },
  { id: 'redstone-tech', name: 'Редстоун Схемы', accent: '#EF4444', bg: '#120A0A', panel: '#241414', text: '#FEE2E2', muted: '#947575', effect: 'Редстоун линии' }
];

let activeAppearancePresetId = null;

function applyAppearancePreset(preset) {
  const root = document.documentElement;
  applyTheme(preset.accent);
  root.style.setProperty('--bg-main', preset.bg);
  root.style.setProperty('--bg-dark', preset.bg);
  document.documentElement.style.background = preset.bg;
  root.style.setProperty('--bg-panel', preset.panel);
  root.style.setProperty('--bg-card', preset.panel);
  root.style.setProperty('--text-main', preset.text);
  root.style.setProperty('--text', preset.text);
  root.style.setProperty('--text-muted', preset.muted);
  root.style.setProperty('--text-dim', preset.muted);
  const effectId = THEME_EFFECT_MAP[preset.effect] || 'default';
  setCanvasEffect(effectId);
  document.body.classList.toggle('glass-mode', !!state.settings.glassMode);
  updateCurrentActiveTheme(
    { accent: preset.accent, bgMain: preset.bg, bgPanel: preset.panel, textMain: preset.text, textMuted: preset.muted },
    effectId
  );
  syncThemeModalFromPreset(preset);
  activeAppearancePresetId = preset.id;
  localStorage.setItem('rdk-appearance-preset', preset.id);
  localStorage.setItem('rdk-theme', preset.accent);
  $$('.appearance-preset-card').forEach(c => c.classList.toggle('active', c.dataset.id === preset.id));
}

function syncThemeModalFromPreset(preset) {
  const mapping = [
    ['ts-accent', 'swatch-accent', 'ts-accent-val', preset.accent],
    ['ts-bg', 'swatch-bg', 'ts-bg-val', preset.bg],
    ['ts-panel', 'swatch-panel', 'ts-panel-val', preset.panel],
    ['ts-text', 'swatch-text', 'ts-text-val', preset.text],
    ['ts-muted', 'swatch-muted', 'ts-muted-val', preset.muted]
  ];
  for (const [inputId, swatchId, valId, color] of mapping) {
    const inp = document.getElementById(inputId);
    const sw = document.getElementById(swatchId);
    const vl = document.getElementById(valId);
    if (inp) inp.value = color;
    if (sw) sw.style.background = color;
    if (vl) vl.textContent = color.toUpperCase();
  }
  const effectSelect = document.getElementById('ts-effect');
  if (effectSelect) effectSelect.value = THEME_EFFECT_MAP[preset.effect] || 'default';
}

function initAppearance() {
  const grid = document.getElementById('appearance-presets-grid');
  if (!grid) return;
  grid.innerHTML = '';

  for (const preset of APPEARANCE_PRESETS) {
    const card = document.createElement('div');
    card.className = 'appearance-preset-card';
    card.dataset.id = preset.id;
    card.innerHTML = `
      <div class="appearance-preset-swatch" style="background:${preset.accent}"></div>
      <div class="appearance-preset-info">
        <div class="appearance-preset-name">${preset.name}</div>
        <div class="appearance-preset-desc">${preset.effect}</div>
      </div>`;
    grid.appendChild(card);
  }

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.appearance-preset-card');
    if (!card) return;
    const preset = APPEARANCE_PRESETS.find(p => p.id === card.dataset.id);
    if (preset) applyAppearancePreset(preset);
  });

  const saved = localStorage.getItem('rdk-appearance-preset');
  if (saved) {
    const preset = APPEARANCE_PRESETS.find(p => p.id === saved);
    if (preset) {
      applyAppearancePreset(preset);
    }
  }
}

async function applySavedThemeConfig() {
  let cfg = null;
  try { if (window.api.getThemeConfig) cfg = await window.api.getThemeConfig(); } catch (e) {}
  if (!cfg) return;
  const themeObj = configToThemeObj(cfg);
  applyFullThemeAndSync(themeObj);
}

// ============================================================
// CANVAS BACKGROUND EFFECTS
// ============================================================

let effectManager = null;

function initBgCanvas() {
  applySavedThemeConfig();
}

function setCanvasEffect(effect) {
  try {
    if (!effectManager) {
      effectManager = new CanvasEffectManager('bg-effect-canvas');
    }

    document.body.classList.remove(
      'bg-effect-default', 'bg-effect-snow', 'bg-effect-stars',
      'bg-effect-galactic', 'bg-effect-void', 'bg-effect-plexus',
      'bg-effect-aurora', 'bg-effect-fireflies', 'bg-effect-none',
      'bg-effect-embers', 'bg-effect-petals', 'bg-effect-bubbles',
      'bg-effect-redstone', 'bg-effect-glitch', 'bg-effect-cubes'
    );

    if (effect === 'default') {
      document.body.classList.add('bg-effect-default');
      effectManager.switchEffect('none');
      return;
    }
    if (effect === 'none') {
      document.body.classList.add('bg-effect-none');
      effectManager.switchEffect('none');
      return;
    }

    effectManager.switchEffect(effect);
  } catch (e) {
    console.error('[setCanvasEffect]', e);
  }
}


