import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {POST} from '../app/api/webhooks/vault-care-calls/route';
test('webhook fails closed without credentials and rejects unsigned/expired/invalid snapshots',async()=>{
 const secret='test-only-key-never-used-in-production';
 process.env.VAULT_CARE_SYNC_ENABLED='false';
 assert.equal((await POST(new Request('https://example.com',{method:'POST',body:'{}'}))).status,503);
 process.env.VAULT_CARE_SYNC_SECRET=secret;process.env.VAULT_CARE_SYNC_ENABLED='true';
 const send=async(body:string,timestamp=String(Date.now()),signature?:string)=>POST(new Request('https://example.com',{method:'POST',body,headers:{'x-vault-timestamp':timestamp,'x-vault-signature':signature??createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex')}}));
 assert.equal((await send('{}',String(Date.now()),'0'.repeat(64))).status,401);
 assert.equal((await send('{}',String(Date.now()-600000))).status,401);
 assert.equal((await send('{}')).status,400);
 assert.equal((await send('x'.repeat(2049))).status,413);
 assert.equal((await send(JSON.stringify({metric:'care-call-attempts-v1',startDate:'2026-10-26',date:'2026-10-25',count:3,revision:Date.now()}))).status,400);
 delete process.env.VAULT_CARE_SYNC_SECRET;delete process.env.VAULT_CARE_SYNC_ENABLED;
});
