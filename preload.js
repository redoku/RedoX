const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizeChange: (cb) => {
    const l = (_e, val) => cb(val);
    ipcRenderer.on('window-maximize-change', l);
    return () => ipcRenderer.removeListener('window-maximize-change', l);
  },

  getVersions: () => ipcRenderer.invoke('get-versions'),
  isVersionDownloaded: (v) => ipcRenderer.invoke('is-version-downloaded', v),

  getAccounts: () => ipcRenderer.invoke('get-accounts'),
  addAccount: (u) => ipcRenderer.invoke('add-account', u),
  removeAccount: (u) => ipcRenderer.invoke('remove-account', u),

  selectAvatar: (username) => ipcRenderer.invoke('select-avatar', username),
  getAvatar: (username) => ipcRenderer.invoke('get-avatar', username),

  getCustomProfiles: () => ipcRenderer.invoke('get-custom-profiles'),
  addCustomProfile: (name, version, loader) => ipcRenderer.invoke('add-custom-profile', name, version, loader),
  deleteCustomProfile: (id) => ipcRenderer.invoke('delete-custom-profile', id),

  getInstalledMods: (iname) => ipcRenderer.invoke('get-installed-mods', iname),
  toggleMod: (iname, fn) => ipcRenderer.invoke('toggle-mod', iname, fn),
  removeMod: (iname, fn) => ipcRenderer.invoke('remove-mod', iname, fn),
  openModsFolder: (iname) => ipcRenderer.invoke('open-mods-folder', iname),
  showInFolder: (iname, fn) => ipcRenderer.invoke('show-in-folder', iname, fn),
  renameMod: (iname, oldName, newName) => ipcRenderer.invoke('rename-mod', iname, oldName, newName),
  copyMod: (iname, fn) => ipcRenderer.invoke('copy-mod', iname, fn),
  deleteMod: (iname, fn) => ipcRenderer.invoke('delete-mod', iname, fn),

  getSelectedProfile: () => ipcRenderer.invoke('get-selected-profile'),
  saveSelectedProfile: (id) => ipcRenderer.invoke('save-selected-profile', id),

  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
  changeLauncherSize: (mode, w, h) => ipcRenderer.send('change-launcher-size', mode, w, h),
  applySharedSettings: (instanceName) => ipcRenderer.invoke('apply-shared-settings', instanceName),

  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  onServerStatus: (cb) => {
    const l = (_e, d) => cb(d);
    ipcRenderer.on('server-status', l);
    return () => ipcRenderer.removeListener('server-status', l);
  },

  launchGame: (u, pd, sm) => ipcRenderer.invoke('launch-game', u, pd, sm),
  onProgress: (cb) => {
    const l = (_e, d) => cb(d);
    ipcRenderer.on('launch-progress', l);
    return () => ipcRenderer.removeListener('launch-progress', l);
  },

  openLauncherFolder: () => ipcRenderer.invoke('open-launcher-folder'),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  openGameFolder: (iname) => ipcRenderer.invoke('open-game-folder', iname),
  browseFolder: (currentPath) => ipcRenderer.invoke('browse-folder', currentPath),
  dropMods: (instanceName, filePaths) => ipcRenderer.invoke('drop-mods', instanceName, filePaths),

  downloadAddon: (modId, instanceName) => ipcRenderer.invoke('download-addon', modId, instanceName),
  removeAddon: (modId, instanceName) => ipcRenderer.invoke('remove-addon', modId, instanceName),

  modrinthSearch: (query, categories, limit, offset, loader) => ipcRenderer.invoke('modrinth-search', query, categories, limit, offset, loader),
  modrinthDownload: (projectId, instanceName, version, loader) => ipcRenderer.invoke('modrinth-download', projectId, instanceName, version, loader),
  getModManifest: (instanceName) => ipcRenderer.invoke('get-mod-manifest', instanceName),
  addModToManifest: (instanceName, projectId, fileName, modName, source) => ipcRenderer.invoke('add-mod-to-manifest', instanceName, projectId, fileName, modName, source),
  removeModFromManifest: (instanceName, projectId) => ipcRenderer.invoke('remove-mod-from-manifest', instanceName, projectId),
  removeModrinthMod: (projectId, instanceName) => ipcRenderer.invoke('remove-modrinth-mod', projectId, instanceName),

  openLogWindow: () => ipcRenderer.invoke('open-log-window'),
  sendLogLine: (line) => ipcRenderer.invoke('send-log-line', line),
  clearLogHistory: () => ipcRenderer.invoke('clear-log-history'),
  onLogLine: (cb) => { const l = (_e, line) => cb(line); ipcRenderer.on('log-line', l); return () => ipcRenderer.removeListener('log-line', l); },
  onLogHistory: (cb) => { const l = (_e, lines) => cb(lines); ipcRenderer.on('log-history', l); return () => ipcRenderer.removeListener('log-history', l); },
  onLogClear: (cb) => { const l = () => cb(); ipcRenderer.on('log-clear', l); return () => ipcRenderer.removeListener('log-clear', l); },
  onLogWindowClosed: (cb) => { const l = () => cb(); ipcRenderer.on('log-window-closed', l); return () => ipcRenderer.removeListener('log-window-closed', l); },

  checkGithubUpdate: () => ipcRenderer.invoke('check-github-update'),

  getThemeConfig: () => ipcRenderer.invoke('get-theme-config'),
  saveThemeConfig: (cfg) => ipcRenderer.invoke('save-theme-config', cfg),
});
