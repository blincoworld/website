// Enquiry form only. The preserved partners.js chatbot is not loaded on this page.
const API='https://agency.piersblinco.com/api/partners-public/';
const form=document.querySelector('[data-enquiry]'),status=document.querySelector('[data-enquiry-status]');
let token=sessionStorage.getItem('agency_partner_visitor')||'';
async function api(path,body){const r=await fetch(API+path,{method:'POST',credentials:'omit',cache:'no-store',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok){if(r.status===401){token='';sessionStorage.removeItem('agency_partner_visitor');}throw Error(d.error||'Please try again later.');}return d;}
form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;try{
 if(!token){if(!confirm('Start a saved conversation? Piers can review your messages in Agency OS. Messages are marked for deletion after 30 days and removed when expired records are next processed. Please avoid confidential or sensitive information.'))throw Error('Conversation not started.');const session=await api('session',{notice_accepted:true,ai_consent:false,honeypot:''});token=session.token;sessionStorage.setItem('agency_partner_visitor',token);}
 const data=Object.fromEntries(new FormData(form));data.response_requested=form.elements.response_requested.checked;await api('enquiry',data);form.reset();status.textContent='Your enquiry is saved for Piers to review. No call is booked automatically and no immediate response is promised.';
 }catch(error){status.textContent=error.message;}finally{button.disabled=false;}};
