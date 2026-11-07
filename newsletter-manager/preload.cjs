const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('newsletterApp', {
  features: { discovery: true, desktop: true },
  getSession: () => ipcRenderer.invoke('newsletter:get-session'),
  login: details => ipcRenderer.invoke('newsletter:login', details),
  logout: () => ipcRenderer.invoke('newsletter:logout'),
  load: () => ipcRenderer.invoke('newsletter:load'),
  readIssue: date => ipcRenderer.invoke('newsletter:read-issue', date),
  confirmDiscard: () => ipcRenderer.invoke('newsletter:confirm-discard'),
  importHtml: () => ipcRenderer.invoke('newsletter:import-html'),
  save: payload => ipcRenderer.invoke('newsletter:save', payload),
  scheduleAdd: entry => ipcRenderer.invoke('newsletter:schedule-add', entry),
  scheduleRemove: date => ipcRenderer.invoke('newsletter:schedule-remove', date),
  scheduleRead: date => ipcRenderer.invoke('newsletter:schedule-read', date),
  schedulePublish: date => ipcRenderer.invoke('newsletter:schedule-publish', date),
  saveFile: file => ipcRenderer.invoke('newsletter:save-file', file),
  openExternal: url => ipcRenderer.invoke('app:open-external', url),

  discovery: {
    state: () => ipcRenderer.invoke('discover:state'),
    run: options => ipcRenderer.invoke('discover:run', options || {}),
    addSource: entry => ipcRenderer.invoke('discover:source-add', entry),
    updateSource: (id, patch) => ipcRenderer.invoke('discover:source-update', id, patch),
    removeSource: id => ipcRenderer.invoke('discover:source-remove', id),
    setFindingStatus: (ids, status) => ipcRenderer.invoke('discover:finding-status', ids, status),
    onProgress: callback => subscribe('discover:progress', callback),
    onFinished: callback => subscribe('discover:finished', callback)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: patch => ipcRenderer.invoke('settings:set', patch),
    onChanged: callback => subscribe('settings:changed', callback)
  },
  ai: {
    status: () => ipcRenderer.invoke('ai:status'),
    setKey: key => ipcRenderer.invoke('ai:set-key', key),
    testKey: key => ipcRenderer.invoke('ai:test-key', key)
  },
  draft: {
    generate: request => ipcRenderer.invoke('draft:generate', request),
    onProgress: callback => subscribe('draft:progress', callback)
  },
  onNavigate: callback => subscribe('app:navigate', callback),
  onRunDiscovery: callback => subscribe('app:run-discovery', callback)
});
