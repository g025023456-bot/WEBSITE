const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('newsletterApp', {
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
  schedulePublish: date => ipcRenderer.invoke('newsletter:schedule-publish', date)
});
