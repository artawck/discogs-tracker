'use strict';

const { app } = require('electron');
const { DiscogsTrackerApp } = require('./app/DiscogsTrackerApp');

const trackerApp = new DiscogsTrackerApp();

app.whenReady().then(() => trackerApp.start());

app.on('window-all-closed', () => {
  // Keep running in the tray so the daily check still fires.
});
