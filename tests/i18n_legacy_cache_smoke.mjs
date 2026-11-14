import assert from 'node:assert/strict';
import {handleShopOrderSubmit} from '../public/shop-orders-ui.js';
import {handleShopAction} from '../public/shop-ui.js';

// iPhone Safari can temporarily combine a cached old i18n.js with fresh feature modules.
// Such a mismatch must not stop approval, rejection, or settlement.
const calls=[];
let confirmations=0,notifications=0;
globalThis.window={
 TramI18n:{getLanguage:()=>'hmn'}, // legacy object has no translateLabel
 confirm:(message)=>{assert.equal(typeof message,'string');confirmations++;return true;}
};
const ctx={
 api:async (path,method,body)=>{calls.push({path,method,body});return {ok:true,message:'OK'};},
 toast:()=>{notifications++;},
 navigate:async()=>{}
};
await handleShopOrderSubmit('shop-order-reject',{id:'orderA',reason_code:'3'},ctx);
assert.deepEqual(calls[0],{path:'/api/admin/shop/orders/orderA',method:'POST',body:{status:'rejected',reason_code:'3'}});
await handleShopOrderSubmit('shop-order-provisional',{id:'orderB',estimated_reward_lua:'1500'},ctx);
assert.equal(calls[1].body.status,'provisional');
await handleShopOrderSubmit('shop-order-resolve',{
 id:'orderC',reward_lua:'2500',settled_reference:'ORDER123456',
 delivery_paid_confirmed:'1'
},ctx);
assert.equal(calls[2].body.status,'resolved');
assert.equal(calls[2].body.reward_lua,2500);
await handleShopAction('shop-request-reject',{dataset:{id:'request1'}},ctx);
assert.equal(calls[3].body.status,'rejected');
assert.equal(confirmations,4);
assert.equal(notifications,4);

// No translation library at all should still allow a confirmation.
delete window.TramI18n;
await handleShopOrderSubmit('shop-order-reject',{id:'orderD',reason_code:'1'},ctx);
assert.equal(calls[4].body.reason_code,'1');

// When translation is available, use it normally.
window.TramI18n={translateLabel:()=> 'Koj puas paub tseeb?'};
window.confirm=(message)=>{assert.equal(message,'Koj puas paub tseeb?');return true;};
await handleShopOrderSubmit('shop-order-reject',{id:'orderE',reason_code:'0'},ctx);
assert.equal(calls[5].body.reason_code,'0');
console.log('PASS: old Safari language cache cannot block TikTok order rejection, approval, settlement or product requests.');
