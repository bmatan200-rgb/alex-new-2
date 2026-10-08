import test from 'node:test';
import assert from 'node:assert/strict';
import {classifySmsFailure,scheduledRetryAt} from '../server/smsDeliveryPolicy';
test('429 without an accepted ID is retryable; 5xx or returned ID is uncertain',()=>{
  assert.deepEqual(classifySmsFailure(429,{},'120'),{uncertain:false,retryable:true,retryAfterMs:120000});
  assert.equal(classifySmsFailure(429,{data:{id:'accepted'}},null).uncertain,true);
  assert.equal(classifySmsFailure(429,{data:{id:'accepted'}},null).retryable,false);
  for(const status of [500,502,503])assert.equal(classifySmsFailure(status,{},null).uncertain,true);
  for(const status of [400,401,403,404])assert.equal(classifySmsFailure(status,{},null).retryable,false);
});
test('retry delay honors provider limits and stops after three attempts',()=>{
  const limited=classifySmsFailure(429,{},'120');assert.equal(scheduledRetryAt(limited,1,3,1000),121000);
  assert.equal(scheduledRetryAt(limited,2,3,1000),121000);
  assert.equal(scheduledRetryAt(limited,3,3,1000),0);
  assert.equal(scheduledRetryAt(limited,0,3,1000),0); // manual flow never gains a retry
  assert.equal(scheduledRetryAt({...limited,uncertain:true},1,3,1000),0);
  assert.equal(classifySmsFailure(429,{},'NaN').retryAfterMs,60000);
  assert.equal(classifySmsFailure(429,{},'999999999').retryAfterMs,3600000);
});
