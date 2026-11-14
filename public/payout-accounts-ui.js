// Tài khoản nhận tiền: lưu riêng cho từng thành viên, không tự tạo yêu cầu rút.
let editAccountId=null;
let knownAccounts=[];
const tr=s=>window.TramI18n?.translateLabel?.(s)??s;
const ask=s=>window.confirm(tr(s));
const paymentLabel=a=>a.payment_method==='zalopay'?'ZaloPay':a.bank_name;
export async function payoutAccountsPage({api,esc,heading,bankList}){
 let data;
 try{data=await api('/api/payout-accounts');}
 catch{
  return `<div class="saved-payout-page">${heading('🏦 Tài khoản nhận tiền','Lưu thông tin để lần sau rút tiền không phải nhập lại.')}
    <div class="callout">⚠️ Chưa tải được tài khoản nhận tiền. Admin cần chạy bảng dữ liệu mới trước; bạn vẫn có thể nhập thông tin thủ công khi rút tiền.</div></div>`;
 }
 knownAccounts=data.accounts||[];
 const current=knownAccounts.find(a=>a.id===editAccountId);
 if(editAccountId&&!current)editAccountId=null;
 const a=current||{payment_method:'bank',bank_name:'',account_number:'',account_owner:'',nickname:'',is_default:knownAccounts.length===0?1:0};
 const method=a.payment_method;
 const bankExists=bankList.some(x=>x[0]===a.bank_name&&x[0]!=='other');
 const selectedBank=bankExists?a.bank_name:a.bank_name?'other':'';
 return `<div class="saved-payout-page">
  ${heading('🏦 Tài khoản nhận tiền','Thêm tài khoản một lần, những lần rút tiền sau chỉ cần chọn lại.')}
  <section class="saved-payout-hero"><span aria-hidden="true">🏦</span><div><h2>Thông tin nhận tiền của bạn</h2>
    <p>Lưu ngân hàng hoặc ZaloPay an toàn trong tài khoản. Bạn có thể sửa, xóa, chọn mặc định bất cứ lúc nào.</p></div></section>
  <div class="saved-payout-layout">
   <section class="card saved-payout-list">
    <div class="saved-payout-header"><h3>Tài khoản đã lưu</h3><span>${knownAccounts.length}/${data.max_accounts||10}</span></div>
    ${knownAccounts.length?knownAccounts.map(i=>`<article class="saved-payout-item">
     <div class="saved-payout-item-top"><strong>${esc(i.nickname||paymentLabel(i))}</strong>
     ${i.is_default?'<span class="saved-payout-default">✓ Mặc định</span>':''}</div>
     <div class="saved-payout-meta">${esc(paymentLabel(i))} · ${esc(i.account_number)}</div>
     <div class="saved-payout-meta">${esc(i.account_owner)}</div>
     <div class="saved-payout-actions">
      <button class="btn alt sm" type="button" data-action="payout-account-edit" data-id="${esc(i.id)}">✎ Sửa</button>
      ${!i.is_default?`<button class="btn alt sm" type="button" data-action="payout-account-default" data-id="${esc(i.id)}">✓ Đặt mặc định</button>`:''}
      <button class="btn danger sm" type="button" data-action="payout-account-delete" data-id="${esc(i.id)}">Xóa</button>
     </div></article>`).join(''):'<p class="saved-payout-empty">Bạn chưa lưu tài khoản nào. Hãy thêm tài khoản đầu tiên ở biểu mẫu bên cạnh.</p>'}
   </section>
   <form class="card saved-payout-form" data-form="payout-account">
    <h3>${current?'✎ Chỉnh sửa tài khoản':'＋ Thêm tài khoản nhận tiền'}</h3>
    ${current?`<input type="hidden" name="id" value="${esc(current.id)}"><input type="hidden" name="payment_method" value="${esc(method)}">
      <div class="saved-payout-readonly">Phương thức nhận: <b>${esc(method==='zalopay'?'ZaloPay':'Ngân hàng')}</b> (không thể đổi loại khi sửa)</div>`
      :`<label for="saved-method">Phương thức nhận</label><select id="saved-method" name="payment_method">
        <option value="bank">Ngân hàng</option><option value="zalopay">ZaloPay</option>
       </select>`}
    <div id="saved-bank-fields" ${method==='bank'?'':'hidden'}>
     <label for="saved-bank">Ngân hàng</label>
     <select id="saved-bank" name="bank_name" ${method==='bank'?'required':''}>
      ${bankList.map(([value,label])=>`<option value="${esc(value)}" ${selectedBank===value?'selected':''}>${esc(label)}</option>`).join('')}
     </select>
     <div id="saved-bank-other" ${selectedBank==='other'?'':'hidden'}>
      <label for="saved-bank-other-name">Tên ngân hàng khác</label>
      <input id="saved-bank-other-name" name="bank_other" value="${esc(selectedBank==='other'?a.bank_name:'')}" placeholder="Nhập tên ngân hàng" ${selectedBank==='other'?'required':''}>
     </div>
    </div>
    <label for="saved-number" id="saved-number-label">${method==='zalopay'?'Số điện thoại ZaloPay':'Số tài khoản'}</label>
    <input id="saved-number" name="account_number" value="${esc(a.account_number)}" required autocomplete="off"
      placeholder="${method==='zalopay'?'0xxxxxxxxx':'Nhập số tài khoản'}" ${method==='zalopay'?'inputmode="tel"':'inputmode="text"'} maxlength="30">
    <p class="saved-payout-hint">Số tài khoản BVBank do ZaloPay cấp có thể gồm cả chữ và số (ví dụ bắt đầu 99ZP).</p>
    <label for="saved-owner">Tên chủ tài khoản</label>
    <input id="saved-owner" name="account_owner" value="${esc(a.account_owner)}" required maxlength="100" placeholder="Nhập đúng tên người nhận">
    <label for="saved-nickname">Tên gợi nhớ (không bắt buộc)</label>
    <input id="saved-nickname" name="nickname" value="${esc(a.nickname)}" maxlength="40" placeholder="Ví dụ: Tài khoản của tôi">
    <label class="saved-payout-check"><input type="checkbox" name="is_default" value="1" ${a.is_default?'checked':''}>
      Đặt làm tài khoản mặc định</label>
    <button type="submit" class="btn saved-payout-save">${current?'Lưu thay đổi':'＋ Lưu tài khoản nhận tiền'}</button>
    ${current?'<button type="button" class="btn alt" data-action="payout-account-cancel">Hủy chỉnh sửa</button>':''}
    <p class="saved-payout-hint">Lưu tài khoản không tự động gửi yêu cầu rút tiền. Khi rút, bạn vẫn phải xác nhận số Lúa và phí trước khi gửi.</p>
   </form>
  </div>
  <div class="saved-payout-foot"><button class="btn alt" type="button" data-go="withdrawals">⇢ Đi đến Rút tiền</button>
   <p>Các yêu cầu rút tiền đã gửi vẫn dùng thông tin nhận tiền tại thời điểm gửi, kể cả khi bạn sửa hoặc xóa tài khoản đã lưu.</p></div>
 </div>`;
}
export async function handlePayoutAccountAction(action,el,ctx){
 if(!action.startsWith('payout-account-'))return false;
 const {api,toast,navigate}=ctx;
 const id=el.dataset.id;
 if(action==='payout-account-cancel'){editAccountId=null;await navigate('payout-accounts');return true;}
 if(action==='payout-account-edit'){editAccountId=id;await navigate('payout-accounts');return true;}
 if(!id)return true;
 if(action==='payout-account-default'){
  const r=await api('/api/payout-accounts/'+encodeURIComponent(id)+'/default','POST',{});
  toast(r.message);await navigate('payout-accounts');return true;
 }
 if(action==='payout-account-delete'){
  if(!ask('Bạn chắc chắn muốn xóa tài khoản nhận tiền này? Các yêu cầu rút đã gửi vẫn được giữ nguyên.'))return true;
  const r=await api('/api/payout-accounts/'+encodeURIComponent(id),'DELETE',{});
  if(editAccountId===id)editAccountId=null;
  toast(r.message);await navigate('payout-accounts');return true;
 }
 return false;
}
export async function handlePayoutAccountSubmit(kind,b,ctx){
 if(kind!=='payout-account')return false;
 const {api,toast,navigate}=ctx;
 const selectedBank=b.bank_name==='other'?String(b.bank_other||'').trim():b.bank_name;
 const data={payment_method:b.payment_method,bank_name:selectedBank,
  account_number:String(b.account_number||'').trim(),account_owner:String(b.account_owner||'').trim(),
  nickname:String(b.nickname||'').trim(),is_default:b.is_default==='1'};
 const r=b.id?await api('/api/payout-accounts/'+encodeURIComponent(b.id),'PATCH',data)
   :await api('/api/payout-accounts','POST',data);
 editAccountId=null;toast(r.message);await navigate('payout-accounts');return true;
}
