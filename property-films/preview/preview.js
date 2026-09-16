const api='https://business-os.pbwebonlinesales.workers.dev/api/property-business/previews/';
const token=new URL(location.href).searchParams.get('token');
const status=document.getElementById('status');
if(!/^[a-f0-9]{48}$/.test(token||''))status.textContent='This preview is unavailable.';
else fetch(api+token,{cache:'no-store'}).then(async response=>{
 if(!response.ok)throw new Error('Unavailable');
 return response.json();
}).then(data=>{
 document.getElementById('business').textContent=data.business_name;
 document.getElementById('video').src=api+token+'/video';
 document.getElementById('content').hidden=false;
 status.hidden=true;
}).catch(()=>{status.textContent='This preview is unavailable.';});
