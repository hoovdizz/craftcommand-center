let catalog={metadata:{},items:[]};
let filtered=[];
let shown=80;
let currentUser={username:'',role:'viewer'};
const $=s=>document.querySelector(s);
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function setDisplayMode(mode){const final=['both','icon','text'].includes(mode)?mode:'both';document.body.dataset.display=final;localStorage.setItem('cccDisplayMode',final);$('#displayMode').value=final;}
async function request(path,options={}){const r=await fetch(path,{cache:'no-store',credentials:'same-origin',...options});let d;try{d=await r.json();}catch{d={ok:false,error:`HTTP ${r.status}`};}if(r.status===401){location.href='/';throw new Error('Sign in required');}if(!r.ok)throw new Error(d.error||'Request failed');return d;}
function canOperate(){return ['operator','admin'].includes(currentUser.role);}
function render(){
  const q=$('#catalogSearch').value.trim().toLowerCase(); const cat=$('#catalogCategory').value;
  filtered=catalog.items.filter(i=>(!cat||i.category===cat)&&(!q||i.id.includes(q)||i.name.toLowerCase().includes(q)||i.description.toLowerCase().includes(q)));
  const grid=$('#catalogGrid'); grid.innerHTML='';
  filtered.slice(0,shown).forEach(item=>{
    const card=document.createElement('article'); card.className='catalogCard';
    const iconWrap=document.createElement('span'); iconWrap.className='btnIcon';
    if(window.CCCItemIcons) iconWrap.appendChild(window.CCCItemIcons.create(item));
    const text=document.createElement('div'); text.className='btnText'; text.innerHTML=`<h3>${escapeHtml(item.name)}</h3><code>${escapeHtml(item.id)}</code><p>${escapeHtml(item.description)}</p><p><strong>${escapeHtml(item.category)}</strong></p>`;
    const actions=document.createElement('div'); actions.className='catalogActions'; actions.innerHTML='<button class="good give">Give</button><button class="copy">Copy ID</button><button class="use">Dashboard</button>';
    card.append(iconWrap,text,actions);
    const giveButton=card.querySelector('.give'); giveButton.disabled=!canOperate(); giveButton.title=canOperate()?'Give this item':'Viewer accounts cannot send commands';
    giveButton.addEventListener('click',()=>giveItem(item.id));
    card.querySelector('.copy').addEventListener('click',async()=>{await navigator.clipboard.writeText(item.id);$('#catalogResult').textContent=`Copied: ${item.id}`;});
    card.querySelector('.use').addEventListener('click',()=>location.href=`/?item=${encodeURIComponent(item.id)}`); grid.appendChild(card);
  });
  $('#catalogCount').textContent=`Showing ${Math.min(shown,filtered.length).toLocaleString()} of ${filtered.length.toLocaleString()} matching items — ${catalog.metadata.count.toLocaleString()} total catalog entries.`;
  $('#showMore').classList.toggle('hidden',shown>=filtered.length);
}
async function giveItem(item){if(!canOperate())throw new Error('Your account is view-only');const body={target:$('#catalogTarget').value,item,amount:Number($('#catalogAmount').value)};try{const d=await request('/api/give',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});$('#catalogResult').textContent=`✅ Sent ${d.command}\nScreen: ${d.activeScreenSession||'auto'}`;}catch(e){$('#catalogResult').textContent=`❌ ${e.message}`;}}
async function init(){const auth=await request('/api/auth/status');if(!auth.authenticated){location.href='/';return;}currentUser={username:auth.username||'',role:auth.role||'viewer'};if($('#userBadge'))$('#userBadge').textContent=`${currentUser.username} • ${currentUser.role}`;const [cat,players]=await Promise.all([fetch('/item-catalog.json',{cache:'no-store'}).then(r=>r.json()),request('/api/players')]);catalog=cat;$('#catalogVersion').textContent=`Official Bedrock identifiers • Minecraft ${cat.metadata.minecraftRelease} • snapshot ${cat.metadata.snapshotDate} • ${cat.metadata.count.toLocaleString()} entries • Minecraft Wiki inventory art`;const cats=[...new Set(cat.items.map(i=>i.category))].sort();cats.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;$('#catalogCategory').appendChild(o);});players.players.forEach(p=>{const o=document.createElement('option');o.value=p.target;o.textContent=p.label;$('#catalogTarget').appendChild(o);});setDisplayMode(localStorage.getItem('cccDisplayMode')||'both');document.querySelectorAll('[data-admin-nav]').forEach(el=>el.classList.toggle('hidden',currentUser.role!=='admin'));render();}
$('#catalogSearch').addEventListener('input',()=>{shown=80;render();});$('#catalogCategory').addEventListener('change',()=>{shown=80;render();});$('#showMore').addEventListener('click',()=>{shown+=80;render();});$('#displayMode').addEventListener('change',e=>setDisplayMode(e.target.value));
init().catch(e=>{$('#catalogResult').textContent=`Could not load catalog: ${e.message}`;});
