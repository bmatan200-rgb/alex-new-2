import test from 'node:test';
import assert from 'node:assert/strict';
import { blocksForDay, isCalendarBlock, releaseDayBlocks, publicBusyAppointment, CALENDAR_BLOCK_LABEL } from '../src/utils/calendarBlocks';
import { getDailySlotsOccupancy } from '../src/utils/dateUtils';
import type { Appointment } from '../src/types';

const date = '2026-10-08';
const block: Appointment = { id: 'break', customer_name: '🔒 עניין אישי', customer_phone: 'חסימת יומן',
  service_id: 1, service_name: 'private reason', price: 0, appointment_date: date,
  start_time: '09:20', end_time: '10:50', status: 'confirmed', notes: 'private note' };
const client: Appointment = { ...block, id: 'client', customer_name: 'לקוחה', customer_phone: '0541234567', price: 0 };

test('daily release includes only confirmed calendar blocks on selected date, once per ID', () => {
  const rows = [block, {...block}, client, {...client, id: 'manual', customer_phone: 'שריון יזום'},
    {...block, id: 'tomorrow', appointment_date: '2026-10-09'}, {...block, id: 'cancelled', status: 'cancelled' as const}];
  assert.deepEqual(blocksForDay(rows, date).map(a => a.id), ['break']);
  assert.equal(isCalendarBlock(client), false);
  assert.equal(isCalendarBlock({...client, customer_phone: 'שריון יזום'}), false);
  assert.equal(isCalendarBlock({...client, customer_name: 'חופש 🔒'}), false);
});

test('release waits for each cancellation, preserves clients and reports partial failure', async () => {
  const calls: string[] = [];
  const result = await releaseDayBlocks([block, client, {...block, id: 'failed'}, {...block, id: 'last'}], date, async id => {
    await Promise.resolve(); calls.push(id); if (id === 'failed') throw new Error('offline');
  });
  assert.deepEqual(calls, ['break', 'failed', 'last']);
  assert.deepEqual(result, {released: 2, failed: 1});
  assert.deepEqual(await releaseDayBlocks([], date, () => assert.fail()), {released: 0, failed: 0});
});

test('public availability reveals the fixed break label without customer data or private notes', () => {
  const visible = publicBusyAppointment(block.id, block);
  assert.equal(visible.customer_name, CALENDAR_BLOCK_LABEL);
  assert.equal(visible.customer_phone, '');
  assert.equal(visible.notes, '');
  assert.equal(visible.service_name, '');
  assert.equal(publicBusyAppointment(client.id, client).customer_name, 'תפוס');
  assert.equal(JSON.stringify(visible).includes('private'), false);
});

test('customer slots distinguish breaks and clients and become available after release', () => {
  const publicBlock = publicBusyAppointment(block.id, block);
  assert.equal(getDailySlotsOccupancy(date, [publicBlock], 90)[0].status, 'blocked');
  assert.equal(getDailySlotsOccupancy(date, [publicBusyAppointment(client.id, client)], 90)[0].status, 'client_booked');
  assert.equal(getDailySlotsOccupancy(date, [{...block, status: 'cancelled'}], 90)[0].status, 'free');
  assert.equal(getDailySlotsOccupancy(date, [client], 90)[0].status, 'client_booked');
});
