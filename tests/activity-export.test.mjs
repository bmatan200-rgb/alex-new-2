import test from 'node:test';
import assert from 'node:assert/strict';
import {activityRange} from '../server/activityRange.ts';
import {activityCsv} from '../src/utils/activityCsv.ts';
test('inclusive ranges cover end date, leap day, year boundary and reject impossible dates',()=>{
 assert.deepEqual(activityRange({period:'range',startDate:'2024-02-29',endDate:'2024-02-29'}),{start:'2024-02-29',end:'2024-03-01',period:'range'});
 assert.equal(activityRange({period:'range',startDate:'2026-12-31',endDate:'2026-12-31'}).end,'2027-01-01');
 assert.equal(activityRange({period:'month',year:2026,month:12}).end,'2027-01-01');
 assert.equal(activityRange({period:'year',year:2026}).end,'2027-01-01');
 for(const input of [{period:'range',startDate:'2026-02-29',endDate:'2026-03-01'},{period:'range',startDate:'2026-10-02',endDate:'2026-10-01'},{period:'month',year:2026,month:13},{period:'year',year:''}])assert.throws(()=>activityRange(input));
});
test('CSV preserves Hebrew and quoting, neutralizes formulas and excludes private tokens',()=>{
 const csv=activityCsv('מספרה',[{appointment_date:'2026-10-01',start_time:'09:00',customer_name:'=HYPERLINK("bad")',service_name:'טיפול, "א"',accessTokenHash:'secret',audit:[]}]);
 assert.ok(csv.startsWith('\uFEFF'));
 assert.ok(csv.includes('טיפול, ""א""'));
 assert.ok(csv.includes("'=HYPERLINK"));
 assert.ok(!csv.includes('secret'));
});
