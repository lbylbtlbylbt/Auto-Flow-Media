const get=id=>document.getElementById(id);
async function api(path,data){
  const options=data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{};
  const response=await fetch(path,options);
  const body=await response.json();
  if(!response.ok)throw Error(body.error);
  return body;
}
function row(target,text,detail){
  const line=document.createElement('div'),label=document.createElement('span'),sub=document.createElement('small');
  line.className='row';label.textContent=text;sub.textContent=detail;line.append(label,sub);get(target).append(line);return line;
}
async function refresh(){
  const {user,assets,members,notes}=await api('/state');
  get('login').hidden=true;get('workspace').hidden=false;get('title').textContent=user.space;
  get('identity').textContent=user.name+' · '+user.role;
  for(const id of ['assets','notes','members'])get(id).replaceChildren();
  const select=get('comment').elements.asset;select.replaceChildren();
  for(const a of assets){
    const line=row('assets',a.asset,'Revision '+a.revision+' · '+(a.available?'Online':'Paused'));
    select.add(new Option(a.asset+' · '+a.revision,a.id));
    if(user.role!=='viewer'){
      const toggle=document.createElement('button');
      toggle.textContent=a.available?'Pause delivery':'Resume delivery';
      toggle.onclick=guard(async()=>{await api('/availability',{id:a.id,available:!a.available});await refresh();});
      line.append(toggle);
    }
  }
  if(!assets.length)get('assets').textContent='No media imported yet.';
  get('comment').hidden=user.role==='viewer'||!assets.length;
  for(const n of notes){const a=assets.find(item=>item.id===n.asset);row('notes',n.body,n.author+' · '+a.asset+' / '+a.revision);}
  get('invite').hidden=user.role!=='admin';
  for(const m of members){
    const line=row('members',m.name,m.role);
    if(user.role==='admin'&&user.id!==m.id){
      const button=document.createElement('button');button.textContent='Revoke';
      button.onclick=guard(async()=>{if(confirm('Revoke access for '+m.name+'?')){await api('/revoke',{id:m.id});await refresh();}});
      line.append(button);
    }
  }
}
function guard(action){return async event=>{event?.preventDefault();get('message').textContent='';try{await action();}catch(e){get('message').textContent=e.message;}};}
function form(id,path,after){const f=get(id);f.onsubmit=guard(async()=>{const data=Object.fromEntries(new FormData(f));if(id==='comment')data.asset=Number(data.asset);const result=await api(path,data);f.reset();after?.(result);await refresh();});}
form('signin','/login');form('comment','/notes');form('invite','/members',r=>{get('key').textContent='Share privately. This key is shown once: '+r.key;});
get('refresh').onclick=guard(refresh);get('logout').onclick=guard(async()=>{await api('/logout',{});location.reload();});
refresh().catch(e=>{if(e.message!=='Sign in to your workspace')get('message').textContent=e.message;});
