// The rider's question (src/state/query.ts): the rules of its time, which need no screen.
import { test, expect } from 'vitest';
import * as query from '../src/state/query';

test('a time after midnight belongs to the night of the day before, when the data has that day', () => {
  query.days.value = ['20261030', '20261031'];
  query.day.value = '20261031';
  query.setWhen({ mode: 'depart', cal: '20261031', hh: '01', mm: '10' });
  expect(query.day.value).toBe('20261030');
  expect(query.at.value).toBe('25:10');
  expect(query.timeTouched.value).toBe(true);
  query.setWhen({ mode: 'arrive', cal: '20261031', hh: '09', mm: '30' });
  expect(query.day.value).toBe('20261031');
  expect(query.at.value).toBe('09:30');
  expect(query.timeMode.value).toBe('arrive');
});

test('a day the data does not have moves to the next one it has', () => {
  query.days.value = ['20261030', '20261102'];
  query.day.value = '20261030';
  query.setWhen({ mode: 'depart', cal: '20261031', hh: '12', mm: '00' });
  expect(query.day.value).toBe('20261102');
});

test('back to now: the service day "now" is on, loaded through the day hook when it changed', () => {
  const asked: string[] = [];
  query.hooks.startDay = () => '20261031';
  query.hooks.dayChanged = (d) => asked.push(d);
  query.day.value = '20261030';
  query.timeTouched.value = true;
  query.resetNow();
  expect(query.day.value).toBe('20261031');
  expect(query.timeTouched.value).toBe(false);
  expect(query.timeMode.value).toBe('depart');
  expect(asked).toEqual(['20261031']);
  query.resetNow(); // the same day: nothing to load
  expect(asked).toEqual(['20261031']);
});

test('a query applied sets its day only when the data has it, and "now" unless it names a time', () => {
  query.days.value = ['20261031'];
  query.day.value = '20261031';
  query.applyWhenAndHow({ bike: 'along', folding: true, day: '20261225', at: '' });
  expect(query.day.value).toBe('20261031');
  expect(query.bike.value).toBe('along');
  expect(query.timeTouched.value).toBe(false);
  query.applyWhenAndHow({ at: '08:15', arriveBy: true });
  expect(query.bike.value).toBe('none');
  expect(query.timeMode.value).toBe('arrive');
  expect(query.timeTouched.value).toBe(true);
});
