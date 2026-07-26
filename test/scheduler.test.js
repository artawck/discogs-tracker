'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DailyScheduler } = require('../src/scheduler');

function setNow(t, y, m, d, h, min) {
  const now = new Date(y, m, d, h, min, 0, 0);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.mock.timers.setTime(now.getTime());
  return now;
}

test('nextRunAt(): returns later today when the check time has not yet passed', (t) => {
  setNow(t, 2024, 5, 15, 8, 0);
  const scheduler = new DailyScheduler({ getSettings: () => ({ checkHour: 9, checkMinute: 30 }), onDue: async () => {} });

  const next = scheduler.nextRunAt();
  assert.deepEqual([next.getFullYear(), next.getMonth(), next.getDate()], [2024, 5, 15]);
  assert.equal(next.getHours(), 9);
  assert.equal(next.getMinutes(), 30);
});

test('nextRunAt(): rolls over to tomorrow when the check time already passed today', (t) => {
  setNow(t, 2024, 5, 15, 10, 0);
  const scheduler = new DailyScheduler({ getSettings: () => ({ checkHour: 9, checkMinute: 0 }), onDue: async () => {} });

  const next = scheduler.nextRunAt();
  assert.deepEqual([next.getFullYear(), next.getMonth(), next.getDate()], [2024, 5, 16]);
  assert.equal(next.getHours(), 9);
});

test('nextRunAt(): rolls over to tomorrow when "now" exactly equals the check time', (t) => {
  setNow(t, 2024, 5, 15, 9, 0);
  const scheduler = new DailyScheduler({ getSettings: () => ({ checkHour: 9, checkMinute: 0 }), onDue: async () => {} });

  const next = scheduler.nextRunAt();
  assert.deepEqual([next.getFullYear(), next.getMonth(), next.getDate()], [2024, 5, 16]);
});

test('start(): fires onDue once the scheduled time arrives, then reschedules for the following day', async (t) => {
  const now = setNow(t, 2024, 5, 15, 8, 0);
  let dueCalls = 0;
  const scheduler = new DailyScheduler({
    getSettings: () => ({ checkHour: 9, checkMinute: 0 }),
    onDue: async () => {
      dueCalls++;
    },
  });

  scheduler.start();
  const delay = new Date(2024, 5, 15, 9, 0, 0).getTime() - now.getTime();
  t.mock.timers.tick(delay);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(dueCalls, 1);

  // It should have rescheduled itself for tomorrow at 9:00 — advance a full day and it fires again.
  t.mock.timers.tick(24 * 60 * 60 * 1000);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(dueCalls, 2);
});

test('start(): a throwing onDue is caught, logged, and does not prevent rescheduling', async (t) => {
  const now = setNow(t, 2024, 5, 15, 8, 0);
  let dueCalls = 0;
  const scheduler = new DailyScheduler({
    getSettings: () => ({ checkHour: 9, checkMinute: 0 }),
    onDue: async () => {
      dueCalls++;
      throw new Error('boom');
    },
  });

  const originalConsoleError = console.error;
  let loggedError = false;
  console.error = () => {
    loggedError = true;
  };

  try {
    scheduler.start();
    const delay = new Date(2024, 5, 15, 9, 0, 0).getTime() - now.getTime();
    t.mock.timers.tick(delay);
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(dueCalls, 1);
    assert.equal(loggedError, true);

    t.mock.timers.tick(24 * 60 * 60 * 1000);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(dueCalls, 2);
  } finally {
    console.error = originalConsoleError;
  }
});

test('stop(): cancels the pending timer so onDue never fires', async (t) => {
  const now = setNow(t, 2024, 5, 15, 8, 0);
  let dueCalls = 0;
  const scheduler = new DailyScheduler({
    getSettings: () => ({ checkHour: 9, checkMinute: 0 }),
    onDue: async () => {
      dueCalls++;
    },
  });

  scheduler.start();
  scheduler.stop();
  t.mock.timers.tick(24 * 60 * 60 * 1000);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(dueCalls, 0);
});

test('reschedule(): picks up a changed check time instead of the one active when start() was called', async (t) => {
  const now = setNow(t, 2024, 5, 15, 8, 0);
  let settings = { checkHour: 9, checkMinute: 0 };
  let dueCalls = 0;
  const scheduler = new DailyScheduler({
    getSettings: () => settings,
    onDue: async () => {
      dueCalls++;
    },
  });

  scheduler.start();
  settings = { checkHour: 20, checkMinute: 0 };
  scheduler.reschedule();

  // The original 9:00 firing time must NOT fire the old timer.
  const oldDelay = new Date(2024, 5, 15, 9, 0, 0).getTime() - now.getTime();
  t.mock.timers.tick(oldDelay);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(dueCalls, 0);

  const newDelay = new Date(2024, 5, 15, 20, 0, 0).getTime() - now.getTime();
  t.mock.timers.tick(newDelay - oldDelay);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(dueCalls, 1);
});
