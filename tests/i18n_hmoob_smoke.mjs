// Hmoob Dawb localization smoke tests. No browser or external dependencies required.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {shopPage,adminShopPage,shopCard} from '../public/shop-ui.js';
import {shopOrdersPage,adminShopOrdersPage} from '../public/shop-orders-ui.js';
const read=(file)=>readFileSync(new URL('../public/'+file,import.meta.url),'utf8');

const hooks={};
const doc={
 readyState:'loading',
 body:{nodeType:1,matches:()=>false,querySelectorAll:()=>[],hasAttribute:()=>false},
 documentElement:{lang:'vi'},
 addEventListener:(name,callback)=>{hooks[name]=callback;},
 createTreeWalker:()=>({nextNode:()=>null}),
 dispatchEvent:()=>{}
};
const storage={value:'hmn',getItem:()=>storage.value,setItem:(k,v)=>{storage.value=v;}};
const sandbox={window:{},document:doc,localStorage:storage,
 NodeFilter:{SHOW_TEXT:4},MutationObserver:class{constructor(fn){this.fn=fn;}observe(){}} ,
 CustomEvent:class{constructor(name,options){this.name=name;this.detail=options.detail;}}
};
vm.createContext(sandbox);
vm.runInContext(read('i18n-extra.js'),sandbox,{filename:'i18n-extra.js'});
vm.runInContext(read('i18n.js'),sandbox,{filename:'i18n.js'});
const i18n=sandbox.window.TramI18n;
assert.equal(i18n.getLanguage(),'hmn');
assert.equal(i18n.translateLabel('Mua sắm nhận Lúa'),'Mus yuav khoom tau Lúa');
assert.equal(i18n.translateLabel('Quy định quan trọng để nhận Lúa'),'Cov cai tseem ceeb kom tau Lúa');
assert.equal(i18n.translateLabel('⚠️ Lưu ý trước khi gửi ID đơn hàng'),'⚠️ Nco ntsoov ua ntej xa tus ID xaj khoom');
assert.notEqual(i18n.translateLabel('Nếu tự tìm mua ở bên ngoài, dù là cùng sản phẩm và có gửi ID đơn hàng, bạn vẫn không được tính Lúa. Admin sẽ kiểm tra nguồn đơn trước khi duyệt.'),'Nếu tự tìm mua ở bên ngoài, dù là cùng sản phẩm và có gửi ID đơn hàng, bạn vẫn không được tính Lúa. Admin sẽ kiểm tra nguồn đơn trước khi duyệt.');
assert.equal(i18n.translateLabel('Xem & mua ngay'),'Saib thiab yuav tam sim no');
assert.equal(i18n.translateLabel('🛍️ Xem & mua ngay – Tích Lúa 🌾'),'🛍️ Saib thiab yuav tam sim no – Sau Lúa 🌾');
assert.equal(i18n.translateLabel('🌾 Đơn hợp lệ, đã giải quyết mới nhận Lúa'),'🌾 Tsuas tau Lúa thaum daim xaj raug cai thiab ua tiav lawm');
assert.equal(i18n.translateLabel('Quản lý mua sắm'),'Tswj kev yuav khoom');
assert.equal(i18n.translateLabel('Đã giải quyết & cộng Lúa'),'Ua tiav thiab ntxiv Lúa');
assert.equal(i18n.translateLabel('Nếu từ chối, chọn lý do có sẵn'),'Yog tsis pom zoo, xaiv ib qho laj thawj');
assert.equal(i18n.translateLabel('Danh mục sản phẩm'),'Pawg khoom');
assert.equal(i18n.translateLabel('Không tìm thấy đơn hàng.'),'Nrhiav tsis pom daim xaj khoom.');
assert.equal(i18n.translateLabel('Chính sách quyền riêng tư'),'Txoj cai ceev ntiag tug');
assert.equal(i18n.translateLabel('Đơn hàng & Lúa'),'Cov khoom xaj & Lúa');
assert.equal(i18n.translateLabel('Duyệt đơn TikTok'),'Tshuaj xyuas cov khoom xaj TikTok');
assert.equal(i18n.translateLabel('Chờ xác minh'),'Tos tshuaj xyuas');
assert.equal(i18n.translateLabel('Tạm duyệt – Chờ giải quyết'),'Pom zoo ib ntus – Tos kom ua tiav');
assert.equal(i18n.translateLabel('Đã giải quyết'),'Ua tiav lawm');
assert.equal(i18n.translateLabel('0 – Không tìm thấy thông tin đơn hàng tương ứng với ID đã cung cấp.').includes('Nrhiav tsis tau'),true);
assert.equal(i18n.translateLabel('2 – Đơn hàng đã được hoàn trả hoặc hoàn tiền nên không đủ điều kiện nhận Lúa.').includes('xa rov qab'),true);
assert.equal(i18n.translateLabel('7 sản phẩm'),'7 yam khoom');
assert.equal(i18n.translateLabel('12 yêu cầu đang chờ'),'12 daim ntawv thov tseem tos');
assert.equal(i18n.translateLabel('3 đơn đã ghi nhận'),'3 daim xaj tau teev tseg');
assert.equal(i18n.translateLabel('Bước 2/3'),'Kauj ruam 2/3');
assert.equal(i18n.translateLabel('Đã tạo yêu cầu SP-ABC123'),'Tsim daim ntawv thov SP-ABC123 lawm');
assert.equal(i18n.translateLabel('Đã tìm thấy 4 yêu cầu mới. Xem đường link mua trong mục Theo dõi yêu cầu bên dưới.').startsWith('Muaj 4'),true);
// User content and order identifiers should stay unchanged if not in UI dictionary.
assert.equal(i18n.translateLabel('SP-88E43C4423'),'SP-88E43C4423');
assert.equal(i18n.translateLabel('Tôi muốn dầu gội đặc biệt'),'Tôi muốn dầu gội đặc biệt');
const textNode={nodeType:3,nodeValue:'  Mua sắm nhận Lúa  ',parentElement:{closest:()=>false}};
i18n.translateTree(textNode);
assert.equal(textNode.nodeValue,'  Mus yuav khoom tau Lúa  ');
i18n.setLanguage('vi');
i18n.translateTree(textNode);
assert.equal(textNode.nodeValue,'  Mua sắm nhận Lúa  ');
i18n.setLanguage('hmn');
i18n.translateTree(textNode);
assert.equal(textNode.nodeValue,'  Mus yuav khoom tau Lúa  ');

const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;');
const base={esc,fmt:x=>String(x),dt:x=>x,heading:(title,sub)=>'<h1>'+title+'</h1><p>'+sub+'</p>'};
const product={id:'p1',title:'Dầu gội mới',description:'',link:'https://vt.tiktok.com/abcdef/',category:'beauty',is_active:1};
const request={id:'r1',code:'SP-TEST123',status:'pending',channel:'zalo',note:'Tôi muốn dầu gội đặc biệt',name:'Khách thử',email:'test@example.org'};
const order={id:'o1',order_reference:'TIKTOKORDER123456789',product_title:'Dầu gội mới',status:'provisional',created_at:'2026-11-14',updated_at:'2026-11-14',estimated_reward_lua:2000,reward_lua:0,name:'Khách thử',email:'test@example.org'};
const pages=[
 shopCard(product,esc),
 await shopPage({...base,api:async()=>({products:[product],requests:[request],contacts:{zalo:'https://zalo.me/example',telegram:'https://t.me/example'}}),state:{shopCategory:'all'}}),
 await adminShopPage({...base,api:async()=>({products:[product],requests:[request],contacts:{zalo:'https://zalo.me/example',telegram:'https://t.me/example'}}),field:(id,label)=>'<label>'+label+'</label>',select:(id,label)=>'<label>'+label+'</label>',state:{shopEdit:null}}),
 await shopOrdersPage({...base,api:async p=>p==='/api/shop/orders'?{orders:[order],events:[]}:{unread:0}}),
 await adminShopOrdersPage({...base,api:async()=>({orders:[order],verification_note:'Đã kiểm tra ID đơn hàng, thông tin sản phẩm trùng khớp. Đơn đang chờ hoàn tất.',rejection_reasons:{
 '0':'Không tìm thấy thông tin đơn hàng tương ứng với ID đã cung cấp.',
 '1':'Đơn hàng đã bị hủy nên không đủ điều kiện nhận Lúa.',
 '2':'Đơn hàng đã được hoàn trả hoặc hoàn tiền nên không đủ điều kiện nhận Lúa.',
 '3':'Sau khi kiểm tra, đơn hàng chưa đáp ứng điều kiện nhận thưởng của chương trình.'
 }})})
];
const required=[
 'MUA SẮM THÔNG MINH • TÍCH LÚA','Gian hàng của Trạm','Theo dõi yêu cầu của bạn',
 '🌾 Lúa dự kiến nhận','Kết quả kiểm tra ID đơn hàng (chỉ Admin xem)',
 'Nếu từ chối, chọn lý do có sẵn','Mã đơn / mã đối soát TikTok đã giải quyết',
 'Chưa có Lúa dự kiến','Đã kiểm tra ID đơn hàng, thông tin sản phẩm trùng khớp. Đơn đang chờ hoàn tất.'
];
for(const item of required){
 if(!i18n.translateLabel(item)||i18n.translateLabel(item)===item)
   throw new Error('Missing Hmoob interface translation for '+item);
}
// All pages have UI labels that can be translated while content entered by customers is untouched.
for(const page of pages)assert.ok(page.length>100);
assert.ok(pages[1].includes('Tôi muốn dầu gội đặc biệt'));
// Các đoạn thông tin trong hai trang điều khoản có bản Hmoob nhưng giữ bản Việt làm gốc.
for(const filename of ['terms.html','privacy.html']){
 const html=read(filename);
 const candidates=[...html.matchAll(/>([^<>]+)</g)].map(m=>m[1].trim())
   .filter(x=>x.length>100&&/[À-ỹĐđ]/u.test(x));
 assert.ok(candidates.length>=4);
 for(const paragraph of candidates)
  assert.notEqual(i18n.translateLabel(paragraph),paragraph,
   'Missing Hmoob legal-page translation ('+filename+'): '+paragraph.slice(0,60));
}
assert.match(read('shop-ui.js'),/askShopConfirm/);
assert.match(read('shop-orders-ui.js'),/askOrderConfirm/);
console.log('PASS: Hmoob covers shopping, order states, Admin reasons, terms and privacy, dynamic counters and language switching.');
