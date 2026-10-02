const crypto=require('node:crypto');
const INVITE='pPjbT5F79a';

function verifySession(token,secret){
  try{
    if(!token||!secret)return null;
    const[p,s]=token.split('.');
    const e=crypto.createHmac('sha256',secret).update(p).digest('base64url');
    const a=Buffer.from(s||''),b=Buffer.from(e);
    if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
    const o=JSON.parse(Buffer.from(p,'base64url').toString());
    return o.exp>Date.now()?o:null;
  }catch{return null}
}
function verifyTicket(token,secret){
  try{
    if(!token||!secret)return null;
    const[p,s]=String(token).split('.');
    const e=crypto.createHmac('sha256',secret).update(p).digest('base64url');
    const a=Buffer.from(s||''),b=Buffer.from(e);
    if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
    const o=JSON.parse(Buffer.from(p,'base64url').toString());
    return o.exp>Date.now()?o:null;
  }catch{return null}
}
function slug(v){
  return String(v||'ticket').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'ticket';
}
async function discordJson(url,opts){
  try{
    const r=await fetch(url,opts);
    let data=null;
    try{data=await r.json()}catch{}
    return {ok:r.ok,status:r.status,data};
  }catch(e){
    return {ok:false,status:0,data:{message:'Connexion à Discord impossible'}};
  }
}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Méthode non autorisée.'});

  const secret=process.env.DISCORD_CLIENT_SECRET;
  const cookie=req.headers.cookie||'';
  const m=cookie.match(/(?:^|; )pw_session=([^;]+)/);
  const admin=verifySession(m?.[1],secret);
  if(!admin?.admin)return res.status(403).json({error:'Droits administrateur requis.'});

  let body=req.body;
  if(typeof body==='string')try{body=JSON.parse(body)}catch{}
  const t=verifyTicket(body?.ticket,secret);
  if(!t)return res.status(400).json({error:'Ticket invalide ou expiré.'});

  const bot=process.env.DISCORD_BOT_TOKEN;
  if(!bot)return res.status(503).json({error:'DISCORD_BOT_TOKEN n’est pas configuré sur Vercel.'});

  let guildId=process.env.DISCORD_GUILD_ID;
  if(!guildId){
    const inv=await discordJson('https://discord.com/api/v10/invites/'+INVITE+'?with_counts=true');
    guildId=inv.data?.guild?.id;
  }
  if(!guildId)return res.status(503).json({error:'Impossible de déterminer le serveur Discord. Configure DISCORD_GUILD_ID.'});

  const staffRole=process.env.DISCORD_STAFF_ROLE_ID||'';
  const parentId=process.env.DISCORD_TICKET_CATEGORY_ID||'';

  const me=await discordJson('https://discord.com/api/v10/users/@me',{headers:{Authorization:'Bot '+bot}});
  if(!me.ok)return res.status(502).json({error:'Le token du bot Discord est invalide.',detail:me.data?.message||('Discord '+me.status)});

  const memberCheck=await discordJson('https://discord.com/api/v10/guilds/'+guildId+'/members/@me',{headers:{Authorization:'Bot '+bot}});
  if(!memberCheck.ok)return res.status(502).json({error:'Le bot PlayWise n’est pas présent sur le serveur Discord.',detail:memberCheck.data?.message||('Discord '+memberCheck.status)});

  const overwrites=[
    {id:String(guildId),type:0,deny:'1024'},
    {id:String(t.uid),type:1,allow:String(1024n|2048n|65536n)}
  ];
  if(staffRole)overwrites.push({id:String(staffRole),type:0,allow:String(1024n|2048n|65536n)});

  const payload={
    name:'ticket-'+slug(t.username)+'-'+String(t.uid).slice(-4),
    type:0,
    topic:'Ticket PlayWise • '+t.subject+' • '+t.uid,
    permission_overwrites:overwrites
  };
  if(parentId)payload.parent_id=String(parentId);

  const cr=await discordJson('https://discord.com/api/v10/guilds/'+guildId+'/channels',{
    method:'POST',
    headers:{Authorization:'Bot '+bot,'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });

  if(!cr.ok){
    const code=cr.data?.code;
    let hint='';
    if(cr.status===403||code===50013)hint='Le bot doit avoir la permission « Gérer les salons » et son rôle doit être suffisamment haut.';
    else if(code===10004)hint='Le DISCORD_GUILD_ID ne correspond pas au serveur.';
    else if(code===50035)hint='Un ID de rôle ou de catégorie Discord est incorrect.';
    return res.status(502).json({
      error:'Impossible de créer le salon Discord.',
      detail:[cr.data?.message||('Discord '+cr.status),hint].filter(Boolean).join(' — ')
    });
  }

  const ch=cr.data;
  await discordJson('https://discord.com/api/v10/channels/'+ch.id+'/messages',{
    method:'POST',
    headers:{Authorization:'Bot '+bot,'Content-Type':'application/json'},
    body:JSON.stringify({
      content:'<@'+t.uid+'>',
      allowed_mentions:{users:[String(t.uid)]},
      embeds:[{
        title:'🎫 '+t.subject,
        description:t.message,
        color:3894527,
        fields:[
          {name:'Catégorie',value:t.category,inline:true},
          {name:'Créé par',value:'<@'+t.uid+'>',inline:true},
          {name:'Accepté par',value:admin.global_name||admin.username||'Staff',inline:false}
        ],
        footer:{text:'PlayWise Support'},
        timestamp:new Date().toISOString()
      }]
    })
  });

  return res.status(200).json({
    ok:true,
    channelId:ch.id,
    channelUrl:'https://discord.com/channels/'+guildId+'/'+ch.id,
    staffRoleConfigured:!!staffRole
  });
};