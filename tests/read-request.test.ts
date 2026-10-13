import test from 'node:test';
import assert from 'node:assert/strict';
import {readJson,isAccessDenied} from '../src/utils/readRequest';

test('temporary server failures retry and recover without an authentication failure',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify(calls===1?{success:false}:{success:true,user:{role:'super_admin'}}),{status:calls===1?503:200});};
 try{assert.equal((await readJson('/api/auth/me')).user.role,'super_admin');assert.equal(calls,2);}finally{globalThis.fetch=original;}
});
test('permission rejection is not retried and remains distinguishable from network failure',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({success:false}),{status:403});};
 try{await assert.rejects(readJson('/api/auth/me'),isAccessDenied);assert.equal(calls,1);assert.equal(isAccessDenied(new TypeError('network failed')),false);}finally{globalThis.fetch=original;}
});
