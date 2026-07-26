'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { installFakeElectron, uninstallFakeElectron } = require('../helpers/fakeElectron');
const { fakeI18n } = require('../helpers/fakeI18n');

let electron;
let NotificationService;

test.before(() => {
  electron = installFakeElectron();
  ({ NotificationService } = require('../../src/app/NotificationService'));
});

test.after(() => {
  uninstallFakeElectron();
});

test.beforeEach(() => {
  electron.Notification.instances.length = 0;
  electron.Notification._supported = true;
});

test('does nothing when there are no new items', () => {
  const svc = new NotificationService(fakeI18n());
  svc.notifyNewListings({ mode: 'artist', artist: 'Boards of Canada' }, [], () => {});
  assert.equal(electron.Notification.instances.length, 0);
});

test('does nothing when notifications are unsupported', () => {
  electron.Notification._supported = false;
  const svc = new NotificationService(fakeI18n());
  svc.notifyNewListings({ mode: 'artist', artist: 'Boards of Canada' }, [{ price: '$10', edition: 'LP' }], () => {});
  assert.equal(electron.Notification.instances.length, 0);
});

test('shows a notification for a single new item and wires the click handler', () => {
  const svc = new NotificationService(fakeI18n());
  let clicked = false;
  svc.notifyNewListings(
    { mode: 'artist', artist: 'Boards of Canada', album: 'Geogaddi', country: 'Any' },
    [{ price: '$10', edition: 'LP' }],
    () => {
      clicked = true;
    }
  );

  assert.equal(electron.Notification.instances.length, 1);
  const notif = electron.Notification.instances[0];
  assert.match(notif.options.body, /notif\.bodySingle/);
  assert.equal(notif.shown, true);

  notif.simulateClick();
  assert.equal(clicked, true);
});

test('shows a notification for multiple new items using the plural body key', () => {
  const svc = new NotificationService(fakeI18n());
  svc.notifyNewListings(
    { mode: 'artist', artist: 'Boards of Canada' },
    [
      { price: '$10', edition: 'LP' },
      { price: '$20', edition: 'CD' },
    ],
    null
  );

  const notif = electron.Notification.instances[0];
  assert.match(notif.options.body, /notif\.bodyMultiple/);
});

test('label-mode tracking includes the label suffix key in the title', () => {
  const svc = new NotificationService(fakeI18n());
  svc.notifyNewListings({ mode: 'label', label: 'Warp Records' }, [{ price: '$5', edition: '7"' }], null);

  const notif = electron.Notification.instances[0];
  assert.match(notif.options.title, /notif\.title/);
  assert.match(notif.options.title, /tracking\.labelSuffix/);
});

test('a country other than "Any" is appended to the title', () => {
  const svc = new NotificationService(fakeI18n());
  svc.notifyNewListings(
    { mode: 'artist', artist: 'Aphex Twin', country: 'UK' },
    [{ price: '$5', edition: '7"' }],
    null
  );

  const notif = electron.Notification.instances[0];
  assert.match(notif.options.title, /\(UK\)/);
});

test('country "Any" is not appended to the title', () => {
  const svc = new NotificationService(fakeI18n());
  svc.notifyNewListings(
    { mode: 'artist', artist: 'Aphex Twin', country: 'Any' },
    [{ price: '$5', edition: '7"' }],
    null
  );

  const notif = electron.Notification.instances[0];
  assert.doesNotMatch(notif.options.title, /\(Any\)/);
});

test('does not attach a click handler when onClick is not provided', () => {
  const svc = new NotificationService(fakeI18n());
  svc.notifyNewListings({ mode: 'artist', artist: 'Aphex Twin' }, [{ price: '$5', edition: '7"' }], null);

  const notif = electron.Notification.instances[0];
  assert.doesNotThrow(() => notif.simulateClick());
});
