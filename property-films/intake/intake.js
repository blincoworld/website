import { checkoutConfig } from '../packages/checkout-config.mjs';
const api = checkoutConfig.apiUrl.replace(/\/checkout$/, '/intake');
const form = document.querySelector('#intake-form');
const storageKey = 'property-films-intake-token';
let token, order, busy = false;
const field = name => form.elements.namedItem(name);
async function request(path, method = 'GET', body) {
  const response = await fetch(api + path, {method, credentials:'omit', signal:AbortSignal.timeout(30000),
    headers:{...(body ? {'Content-Type':'application/json'} : {}),...(token ? {Authorization:`Bearer ${token}`} : {})},
    ...(body ? {body:JSON.stringify(body)} : {})});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'We couldn’t save your details. Please try again.');
  return data;
}
function done(photoSource) {
  form.hidden = true;
  const success = document.querySelector('#success'); success.hidden = false;
  document.querySelector('#photo-next').textContent = photoSource === 'originals_separately'
    ? "YOUR ORIGINAL PHOTOS — Please keep your original files ready. We'll contact you at the email you provided to arrange a secure photo handoff. There is nothing to upload here yet; your intake is complete."
    : "YOUR PHOTOS — We'll source the best available images from your website or listing. There's nothing else you need to send.";
  success.focus();
}
function render(result) {
  order = result.order;
  const labels = {essential:'ESSENTIAL',signature:'SIGNATURE',multi:'MULTI-PROPERTY'};
  const summary = document.querySelector('#order-summary');summary.replaceChildren();
  for (const [label,value] of [['Package',labels[order.package]],['Properties',`${order.propertyCount} ${order.propertyCount === 1 ? 'Property' : 'Properties'}`],['Seasonal Content',order.seasonal?'Yes':'No'],['Paid',new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(order.amountPaid/100)]]) {
    const box=document.createElement('div'),caption=document.createElement('span'),strong=document.createElement('strong');caption.textContent=label;strong.textContent=value;box.append(caption,strong);summary.append(box);
  }
  summary.hidden=false;document.querySelector('#test-note').hidden=!order.testMode;
  if (order.intakeStatus === 'SUBMITTED') {done(order.photoSource);return;}
  for(const name of ['name','email','phone'])field(name).value=result.customer[name] || '';
  const sections=document.querySelector('#property-sections');sections.replaceChildren();
  for(let i=0;i<order.propertyCount;i++){
    const section=document.createElement('section');section.className='intake-card property-section';
    // Only the server-verified numeric index is interpolated; customer content is never HTML.
    section.innerHTML=`<div class="section-number">YOUR PROPERTY ${i+1}${order.propertyCount>1?' OF '+order.propertyCount:''}</div><h2>INTRODUCE US TO YOUR PROPERTY</h2>
      <label>Property Name<input name="p${i}_name" maxlength="200" required></label>
      <label>Website / Listing URL<input name="p${i}_url" type="url" inputmode="url" placeholder="https://" maxlength="2000" required aria-describedby="p${i}_url-help"></label>
      <p id="p${i}_url-help" class="muted small">Your own website, Airbnb, Booking.com, Vrbo or another listing — whichever shows your property best.</p>
      <label>Second listing URL <span>(optional)</span><input name="p${i}_secondUrl" type="url" inputmode="url" placeholder="https://" maxlength="2000"></label>
      <label>What makes this property special? <span>(optional)</span><textarea name="p${i}_special" rows="3" maxlength="1000" aria-describedby="p${i}_special-help"></textarea></label>
      <p id="p${i}_special-help" class="muted small">A sentence or two is plenty. We'll also research the listing ourselves.</p>
      <label>Anything you definitely want featured? <span>(optional)</span><textarea name="p${i}_feature" rows="3" maxlength="1000"></textarea></label>
      <label>Anything you'd prefer us not to feature? <span>(optional)</span><textarea name="p${i}_avoid" rows="3" maxlength="1000"></textarea></label>`;
    sections.append(section);
  }
  document.querySelector('#seasonal-section').hidden=!order.seasonal;field('seasonalNotes').disabled=!order.seasonal;
  form.hidden=false;
}
form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  if(!form.reportValidity())return;
  const properties=Array.from({length:order.propertyCount},(_,i)=>Object.fromEntries(['name','url','secondUrl','special','feature','avoid'].map(k=>[k,field(`p${i}_${k}`).value])));
  const data={customer:Object.fromEntries(['name','email','phone','businessName'].map(k=>[k,field(k).value])),properties,
    photoSource:field('photoSource').value,seasonalNotes:order.seasonal?field('seasonalNotes').value:'',generalNotes:field('generalNotes').value};
  busy=true;const button=form.querySelector('button[type=submit]');button.disabled=true;button.textContent='SENDING YOUR DETAILS…';
  const error=document.querySelector('#submit-error');error.hidden=true;
  try {const result=await request('','POST',data);done(result.photoSource);}
  catch(e){error.textContent=e.name==='TimeoutError'||e instanceof TypeError ? "We couldn’t connect. Your details are still here — please try again. If your submission reached us, retrying won’t create a duplicate." : e.message;error.hidden=false;error.focus();}
  finally {busy=false;button.disabled=false;button.textContent='SEND TO PRODUCTION';}
});
try {
  const sessionId = new URLSearchParams(location.hash.slice(1)).get('session_id');
  history.replaceState(null,'',location.pathname); // Never retain order access credentials in the address bar.
  let result;
  if(sessionId){
    try {sessionStorage.removeItem(storageKey);}catch{}
    result=await request('/access','POST',{session_id:sessionId});token=result.token;
    try {sessionStorage.setItem(storageKey,token);}catch{}
  }else{
    try {token=sessionStorage.getItem(storageKey);}catch{}
    if(!token)throw new Error('Please start intake from your verified payment confirmation.');
    result=await request('');
  }
  render(result);
}catch(e){document.querySelector('#access-message').textContent=e.name==='TimeoutError'||e instanceof TypeError ? 'We couldn’t connect to verify your order. Please try again shortly.' : e.message;document.querySelector('#access-error').hidden=false;}
finally{document.querySelector('#loading').hidden=true;}
