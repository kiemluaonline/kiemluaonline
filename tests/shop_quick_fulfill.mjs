// Kiểm thử thao tác Admin thêm sản phẩm và thông báo đúng tài khoản trong một giao dịch.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { shopAPI } from '../src/shop.js';
import { adminShopPage, shopCard, shopPage } from '../public/shop-ui.js';

const sql=new DatabaseSync(':memory:');
sql.exec(readFileSync(new URL('../migrations/0001_init.sql',import.meta.url),'utf8'));
sql.exec(readFileSync(new URL('../migrations/0002_shop.sql',import.meta.url),'utf8'));
sql.prepare("INSERT INTO users(id,email,name,password_hash,password_salt,referral_code,role) VALUES(?,?,?,?,?,?,?)")
  .run('u1','u1@example.com','Khách A','pw','salt','REFU1','member');
sql.prepare("INSERT INTO users(id,email,name,password_hash,password_salt,referral_code,role) VALUES(?,?,?,?,?,?,?)")
  .run('u2','u2@example.com','Khách B','pw','salt','REFU2','member');
const req1=randomUUID(),req2=randomUUID(),req3=randomUUID();
const addReq=sql.prepare("INSERT INTO shop_requests(id,code,user_id,channel,note,status) VALUES(?,?,?,?,?,'pending')");
addReq.run(req1,'SP-TEST1','u1','zalo','Mua áo xanh');
addReq.run(req2,'SP-TEST2','u2','telegram','Mua sạc');
addReq.run(req3,'SP-TEST3','u1','zalo','Mua đồ chơi');
class Statement{
 constructor(q){this.q=q;this.values=[];}
 bind(...values){this.values=values;return this;}
 async first(){return sql.prepare(this.q).get(...this.values)||null;}
 async all(){return {results:sql.prepare(this.q).all(...this.values)};}
 async run(){const r=sql.prepare(this.q).run(...this.values);return {meta:{changes:r.changes}};}
}
const DB={
 prepare:q=>new Statement(q),
 async batch(commands){
   sql.exec('BEGIN');
   try{
     const result=[];
     for(const cmd of commands)result.push(await cmd.run());
     sql.exec('COMMIT');return result;
   }catch(e){sql.exec('ROLLBACK');throw e;}
 }
};
const env={DB};
const H={
 auth:async(req,env,role)=>{
   const user=req.headers.get('X-User')||'u1';
   if(role==='admin'&&user!=='admin')throw Object.assign(new Error('Forbidden'),{status:403});
   return {id:user,role:user==='admin'?'admin':'member'};
 },
 readBody:req=>req.json(),
 fail:(status,message)=>{throw Object.assign(new Error(message),{status});},
 json:(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}}),
 id:randomUUID,
 str:(v,max=300)=>String(v??'').trim().slice(0,max)
};
async function call(path,method='GET',body,user='u1'){
 const req=new Request('https://example.org'+path,{
   method,headers:{'X-User':user,...(body?{'Content-Type':'application/json'}:{})},
   body:body?JSON.stringify(body):undefined
 });
 try{
   const res=await shopAPI(req,env,H);
   assert.ok(res);return {status:res.status,data:await res.json()};
 }catch(e){
   if(e.status)return {status:e.status,data:{error:e.message}};
   throw e;
 }
}
const payload={status:'ready_new',title:'Áo xanh',link:'https://vt.tiktok.com/ZS123456/',category:'fashion'};
const form=await adminShopPage({
 api:async()=>({products:[],requests:[{id:req1,code:'SP-TEST1',name:'Khách A',email:'u1@example.com',note:'Mua áo xanh',channel:'zalo',status:'pending'}],contacts:{zalo:'',telegram:''}}),
 esc:x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
 field:(name,label)=>'<label>'+label+'</label><input name="'+name+'">',select:()=>'',heading:()=>'',state:{shopEdit:null}
});
assert.match(form,/data-form="shop-fulfill"/);
assert.match(form,/Thêm sản phẩm & thông báo khách/);
assert.match(form,/name="request_id"/);
assert.match(form,/data-form="shop-showcase"/,'Admin should have a dedicated showcase link form.');
assert.match(form,/shop-showcase-url/,'Admin link input must be present.');
assert.match(form,/name="shop-product-photo"/,'Admin can select a photo for new or existing products.');
assert.match(form,/name="shop-quick-photo"/,'Quick product fulfillment can include a photo.');
assert.match(form,/data-shop-image-input/,'iPhone photo picker must be available.');
const showroom='https://www.tiktok.com/@tramcolua/shop?tab=products';
const invalidShowcase=await call('/api/admin/shop/showcase','PUT',{url:'https://tiktok.com.evil.example/shop'},'admin');
assert.equal(invalidShowcase.status,400,'Do not allow fake TikTok domains.');
assert.equal((await call('/api/admin/shop/showcase','PUT',{url:showroom})).status,403,
 'Members must not edit the showcase URL.');
const savedShowcase=await call('/api/admin/shop/showcase','PUT',{url:showroom},'admin');
assert.equal(savedShowcase.status,200);
assert.equal(savedShowcase.data.showcase_url,showroom);
assert.equal(sql.prepare("SELECT value FROM settings WHERE key='shop_showcase_url'").get().value,showroom);
const readStorefront=(await call('/api/shop')).data;
assert.equal(readStorefront.showcase_url,showroom,'Members should receive the Admin storefront URL.');
assert.equal((await call('/api/admin/shop','GET',undefined,'admin')).data.showcase_url,showroom);
const showcasePage=await shopPage({
 api:async()=>readStorefront,esc:x=>String(x),state:{shopCategory:'all'}
});
assert.match(showcasePage,/href="https:\/\/www\.tiktok\.com\/@tramcolua\/shop\?tab=products"/);
assert.match(showcasePage,/Vào trang trưng bày/);
assert.match(showcasePage,/HƯỚNG DẪN CHO KHÁCH HÀNG/);
assert.match(showcasePage,/Có 2 cách mua hàng để được xét Lúa/);
assert.match(showcasePage,/Cách 1: Mua tại trang trưng bày TikTok Shop/);
assert.match(showcasePage,/Cách 2: Mua từ gian hàng trên website/);
assert.match(showcasePage,/Xem &amp; mua ngay – Tích Lúa/,'Website shopping instructions must mention Buy now CTA.');
assert.match(showcasePage,/Mua xong, quay lại website để báo đơn!/);
assert.match(showcasePage,/href="#shop-showcase"/,'Method 1 should jump to Admin showcase.');
assert.match(showcasePage,/href="#shop-catalog"/,'Method 2 should jump to product listings.');
assert.match(showcasePage,/href="#shop-report-order"/,'Instructions should jump to report button.');
assert.match(showcasePage,/id="shop-showcase"/);
assert.ok(showcasePage.indexOf('class="shop-buy-guide"')<showcasePage.indexOf('class="shop-showcase-entry"'),
 'Two purchasing methods must appear before customers shop.');

assert.match(showcasePage,/data-action="shop-report-order"(?![^>]*disabled)/,
 'Báo đơn phải là nút có thể bấm.');
const shopStyles=readFileSync(new URL('../public/shop.css',import.meta.url),'utf8');
assert.match(shopStyles,/\.shop-showcase-entry \.shop-report-open\.btn:not\(:disabled\)\s*\{[^}]*color:#fff!important;/,
 'Nút báo đơn phải có chữ trắng nổi bật.');
assert.match(shopStyles,/\.shop-showcase-entry \.shop-report-open\.btn:not\(:disabled\)\s*\{[^}]*background:linear-gradient\(120deg,#125f42,/,
 'Nút báo đơn phải có nền xanh rõ ràng.');

assert.match(showcasePage,/rel="noopener noreferrer sponsored"/);
assert.match(showcasePage,/class="shop-showcase-entry"[\s\S]*?class="shop-order-entry shop-report-section"/,
 'When a showcase URL exists, order reporting must be inside the same showcase card.');
assert.equal((showcasePage.match(/id="shop-report-order"/g)||[]).length,1,'One report section ID per page');
assert.equal((showcasePage.match(/data-action="shop-report-order"/g)||[]).length,1,'One reporting button per page');
assert.ok(showcasePage.indexOf('id="shop-report-order"')<showcasePage.indexOf('id="shop-catalog"'),
 'Reporting should appear with the showcase above the product catalogue.');
assert.match(showcasePage,/data-go="shop-orders"/,'Order history remains reachable beside the showroom.');

assert.doesNotMatch(showcasePage,/hoa hồng|tiếp thị liên kết|Affiliate/i);
const hiddenShowcase=await call('/api/admin/shop/showcase','PUT',{url:''},'admin');
assert.equal(hiddenShowcase.status,200);
assert.equal((await call('/api/shop')).data.showcase_url,'');
const hiddenPage=await shopPage({
 api:async()=>({products:[],requests:[],contacts:{zalo:'',telegram:''},showcase_url:''}),
 esc:x=>String(x),state:{shopCategory:'all'}
});
assert.doesNotMatch(hiddenPage,/class="shop-showcase-entry"/);
assert.match(hiddenPage,/Cách 1: Mua tại trang trưng bày TikTok Shop/);
assert.match(hiddenPage,/Trang trưng bày đang được cập nhật/);
assert.doesNotMatch(hiddenPage,/href="#shop-showcase"/,
 'Without a showcase URL, do not offer a broken showcase anchor.');
assert.match(hiddenPage,/href="#shop-catalog"/,'Website catalog remains accessible.');

assert.match(hiddenPage,/id="shop-report-order"/,'Without a showcase link, buyers can still report their orders.');
assert.equal((hiddenPage.match(/data-action="shop-report-order"/g)||[]).length,1);
assert.ok(hiddenPage.indexOf('id="shop-report-order"')>hiddenPage.indexOf('id="shop-catalog"'),
 'No showcase link: keep existing reporting area below products.');

await call('/api/admin/shop/showcase','PUT',{url:showroom},'admin');
assert.equal(sql.prepare('SELECT COUNT(*) n FROM wallet_entries').get().n,0,
 'Setting a storefront must not affect Lúa or rewards.');
const created=await call('/api/admin/shop/requests/'+req1,'POST',payload,'admin');
assert.equal(created.status,200);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM shop_products').get().n,1);
const done=sql.prepare('SELECT status,product_id,seen_at FROM shop_requests WHERE id=?').get(req1);
assert.equal(done.status,'ready');
assert.ok(done.product_id);
assert.equal(done.seen_at,null);
assert.equal(sql.prepare('SELECT is_active FROM shop_products WHERE id=?').get(done.product_id).is_active,1);

const rawPhoto=Buffer.concat([Buffer.from([255,216,255,224]),Buffer.alloc(1190,99),Buffer.from([255,217])]);
const encodedPhoto='data:image/jpeg;base64,'+rawPhoto.toString('base64');
const imagePath='/api/shop/images/'+done.product_id;
const notYet=await call(imagePath,'GET');
assert.equal(notYet.status,404,'Need image upload before the photo is shown.');
const invalidImage=await call('/api/admin/shop/products/'+done.product_id+'/image','PUT',{image_data:'data:image/png;base64,AAAA'},'admin');
assert.equal(invalidImage.status,400,'Only compressed JPEG is accepted.');
assert.equal((await call('/api/admin/shop/products/'+done.product_id+'/image','PUT',{image_data:encodedPhoto})).status,403,
 'Members must never upload product images.');
const uploadedImage=await call('/api/admin/shop/products/'+done.product_id+'/image','PUT',{image_data:encodedPhoto},'admin');
assert.equal(uploadedImage.status,200);
assert.equal(uploadedImage.data.image_url,imagePath);
const imgResponse=await shopAPI(new Request('https://example.org'+imagePath,{
 headers:{'X-User':'u1'}}),env,H);
assert.equal(imgResponse.status,200);
assert.equal(imgResponse.headers.get('Content-Type'),'image/jpeg');
assert.equal(imgResponse.headers.get('Cache-Control'),'private, no-store');
assert.equal(Buffer.from(await imgResponse.arrayBuffer()).equals(rawPhoto),true,'Image body should be identical to uploaded bytes.');
const displayedPhoto=(await call('/api/shop')).data.products.find(x=>x.id===done.product_id);
assert.equal(displayedPhoto.image_url,imagePath,'Member list should use image URL, not embed base64 images.');
assert.ok(!JSON.stringify((await call('/api/shop')).data).includes(encodedPhoto),'Do not download image bytes in API listing.');
const displayedCard=shopCard(displayedPhoto,x=>String(x));
assert.match(displayedCard,/class="shop-product-photo"/,'Real product photo must replace decorative emoji.');
assert.match(displayedCard,/shop-has-photo/,'Product photos should have a separate uncropped frame.');
const responsiveStyles=readFileSync(new URL('../public/shop.css',import.meta.url),'utf8');
assert.match(responsiveStyles,/\.shop-product-art\.shop-has-photo\s*\{[^}]*aspect-ratio:1\/1/,
 'Actual product photos must use an aspect-ratio instead of fixed crop height.');
assert.match(responsiveStyles,/\.shop-product-art \.shop-product-photo\s*\{[^}]*object-fit:contain/,
 'Image must fit completely inside the frame, not be cropped.');
assert.doesNotMatch(responsiveStyles,/\.shop-product-art \.shop-product-photo\s*\{[^}]*object-fit:cover/,
 'Product photos must never use cover cropping.');
assert.match(responsiveStyles,/@media\(max-width:570px\)\s*\{\s*\.shop-product-art\.shop-has-photo[^}]*\}\s*\.shop-product-art \.shop-product-photo\{object-fit:contain/,
 'Mobile layout should also show whole photo.');
assert.match(displayedCard,/loading="lazy"/,'Do not eagerly load all product images.');
assert.doesNotMatch(displayedCard,/shop-art-icon/,'Do not duplicate emoji when a product has a photo.');
const updatedAdmin=(await call('/api/admin/shop','GET',undefined,'admin')).data.products;
assert.equal(updatedAdmin.find(x=>x.id===done.product_id).image_url,imagePath,'Admin can preview saved image.');
const imageRemoval=await call('/api/admin/shop/products/'+done.product_id+'/image','PUT',{image_data:''},'admin');
assert.equal(imageRemoval.status,200);
assert.equal((await call('/api/shop')).data.products.find(x=>x.id===done.product_id).image_url,'');
assert.equal(sql.prepare("SELECT COUNT(*) n FROM settings WHERE key=?").get('shop_product_image:'+done.product_id).n,0);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM shop_products WHERE id=?').get(done.product_id).n,1,
 'Removing image must preserve the product.');
assert.equal(sql.prepare('SELECT COUNT(*) n FROM wallet_entries').get().n,0,
 'Photos must never change the member wallet.');
console.log('PASS: product images upload, member viewing, lightweight listing, photo removal and wallet unchanged.');

assert.equal((await call('/api/shop/alerts')).data.unread,1);
assert.equal((await call('/api/shop/alerts','GET',undefined,'u2')).data.unread,0);
const myShop=(await call('/api/shop')).data;
assert.equal(myShop.requests.find(r=>r.code==='SP-TEST1').status,'ready');
assert.equal(myShop.requests.find(r=>r.code==='SP-TEST1').product_title,'Áo xanh');
assert.equal((await call('/api/shop','GET',undefined,'u2')).data.requests.length,1);
const same=await call('/api/admin/shop/requests/'+req1,'POST',payload,'admin');
assert.equal(same.status,409,'Repeated submission must fail');
assert.equal(sql.prepare('SELECT COUNT(*) n FROM shop_products').get().n,1,'Do not leave duplicate products');
const invalid=await call('/api/admin/shop/requests/'+req3,'POST',{...payload,link:'https://bad.example/phishing'},'admin');
assert.equal(invalid.status,400);
assert.equal(sql.prepare('SELECT status FROM shop_requests WHERE id=?').get(req3).status,'pending');
const missing=await call('/api/admin/shop/requests/'+randomUUID(),'POST',payload,'admin');
assert.equal(missing.status,409);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM shop_products').get().n,1,'Do not leave orphan products');
assert.equal((await call('/api/shop/requests/read','POST',{},'u1')).status,200);
assert.equal((await call('/api/shop/alerts')).data.unread,0);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM wallet_entries').get().n,0,'Product announcements must not credit Lúa');
// Không áp giới hạn lượt/ngày hay số yêu cầu đang chờ đối với mua sắm.
sql.prepare("INSERT INTO settings(key,value) VALUES('shop_contact_zalo','https://zalo.me/0988734511')").run();
for(let i=0;i<21;i++){
 const result=await call('/api/shop/requests','POST',{channel:'zalo',note:'Yêu cầu sản phẩm thứ '+(i+1)});
 assert.equal(result.status,201,'Yêu cầu thứ '+(i+1)+' phải thành công, không hạn mức ngày/chờ');
 assert.match(result.data.code,/^SP-/);
}
assert.equal(sql.prepare("SELECT COUNT(*) n FROM shop_requests WHERE user_id='u1' AND status='pending'").get().n,22);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM wallet_entries').get().n,0);
console.log('PASS: shop requests have no daily or pending-count quota; wallet remains untouched.');
// Public shopping cards must not reveal affiliate-program wording even by default.
const product={id:'p123',title:'Dầu gội',description:'',link:'https://vt.tiktok.com/ZS123456/',category:'beauty'};
const memberCard=shopCard(product,x=>String(x));
assert.match(memberCard,/🛍️ Xem & mua ngay – Tích Lúa 🌾/,'Chosen shopping CTA is present');
assert.match(memberCard,/class="shop-cta-label"/,'Long CTA is wrapped for mobile readability');
assert.match(memberCard,/Đơn hợp lệ, đã giải quyết mới nhận Lúa/,'Rewards are issued only on eligible resolved orders');
assert.doesNotMatch(memberCard,/Nhận Lúa ngay|nhận Lúa ngay/i,'Do not promise instant rewards');
assert.doesNotMatch(memberCard,/Affiliate|tiếp thị liên kết|hoa hồng|lợi nhuận|đối soát/i);
const memberShop=await shopPage({
 api:async path=>({products:[product],requests:[],contacts:{zalo:'',telegram:''}}),
 esc:x=>String(x),state:{shopCategory:'all'}
});
assert.doesNotMatch(memberShop,/Affiliate|tiếp thị liên kết|hoa hồng|lợi nhuận|đối soát/i);
assert.match(memberShop,/Quy định quan trọng để nhận Lúa/);
assert.match(memberShop,/trang trưng bày TikTok Shop của Admin/);
assert.match(memberShop,/dù là cùng sản phẩm và có gửi ID đơn hàng/);
assert.match(memberShop,/Mua ngoài rồi gửi ID không được tính/);
assert.match(memberShop,/href="https:\/\/vt\.tiktok\.com\/ZS123456\//,'Product link remains exactly the Admin-supplied link');
const adminShop=await adminShopPage({
 api:async()=>({products:[],requests:[],contacts:{zalo:'',telegram:''}}),
 esc:x=>String(x),field:()=>'',select:()=>'',heading:(title,sub)=>title+sub,
 state:{shopEdit:null}
});
assert.doesNotMatch(adminShop,/TikTok Shop Affiliate|Link TikTok Shop Affiliate/);

console.log('PASS: buyer-facing product cards and shopping page do not disclose affiliate arrangements.');
console.log('PASS: direct product creation, one-time fulfillment, per-member notification, protected links and unchanged wallet.');
