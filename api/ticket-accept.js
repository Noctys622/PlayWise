const crypto=require('node:crypto');
function verifySession(token,secret){try{if(!token||!secret)return null;const[p,s]=token.split('.');const e=crypto.createHmac('sha256',secret).update(p).digest('base64url');const a=Buffer.from(s||''),b=Buffer.from(e);if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;const o=JSON.parse(Buffer.from(p,'base64url').toString());return o.exp>Date.now()?o:null}catch{return null}}
function verifyTicket(token,secret){try{if(!token||!secret)return null;const[p,s]=String(token).split('.');const e=crypto.createHmac('sha256',secret).update(p).digest('base64url');const a=Buffer.from(s||''),b=Buffer.from(e);if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;const o=JSON.parse(Buffer.from(p,'base64url').toString());return o.exp>Date.now()?o:null}catch{return null}}
function slug(v){return String(v||'ticket').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'ticket'}
module.exports=async(req,res)=>{res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Méthode non autorisée.'});
 const secret=process.env.DISCORD_CLIENT_SECRET;const cookie=req.headers.cookie||'',m=cookie.match(/(?:^|; )pw_session=([^;]+)/),admin=verifySession(m?.[1],secret);if(!admin?.admin)return res.status(403).json({error:'Droits administrateur requis.'});
 let body=req.body;if(typeof body==='string')try{body=JSON.parse(body)}catch{}
 const t=verifyTicket(body?.ticket,secret);if(!t)return res.status(400).json({error:'Ticket invalide ou expiré.'});
 const bot=process.env.DISCORD_BOT_TOKEN,guildId=process.env.DISCORD_GUILD_ID,staffRole=process.env.DISCORD_STAFF_ROLE_ID,parentId=process.env.DISCORD_TICKET_CATEGORY_ID;
 if(!bot||!guildId||!staffRole)return res.status(503).json({error:'Configuration ticket incomplète sur Vercel.'});
 const channelName='ticket-'+slug(t.username)+'-'+String(t.uid).slice(-4);
 const payload={name:channelName,type:0,topic:'Ticket PlayWise • '+t.subject+' • '+t.uid,permission_overwrites:[
   {id:guildId,type:0,deny:'1024'},
   {id:String(t.uid),type:1,allow:String(1024n|2048n|65536n)},
   {id:String(staffRole),type:0,allow:String(1024n|2048n|65536n)}
 ]};
 if(parentId)payload.parent_id=String(parentId);
 const cr=await fetch('https://discord.com/api/v10/guilds/'+guildId+'/channels',{method:'POST',headers:{Authorization:'Bot '+bot,'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(()=>null);
 if(!cr?.ok){let detail='';try{detail=JSON.stringify(await cr.json())}catch{};return res.status(502).json({error:'Impossible de créer le salon Discord.',detail})}
 const ch=await cr.json();
 await fetch('https://discord.com/api/v10/channels/'+ch.id+'/messages',{method:'POST',headers:{Authorization:'Bot '+bot,'Content-Type':'application/json'},body:JSON.stringify({content:'<@'+t.uid+'>',allowed_mentions:{users:[String(t.uid)]},embeds:[{title:'🎫 '+t.subject,description:t.message,color:3894527,fields:[{name:'Catégorie',value:t.category,inline:true},{name:'Créé par',value:'<@'+t.uid+'>',inline:true},{name:'Accepté par',value:admin.global_name||admin.username||'Staff',inline:false}],footer:{text:'PlayWise Support'},timestamp:new Date().toISOString()}]})}).catch(()=>null);
 return res.status(200).json({ok:true,channelId:ch.id,channelUrl:'https://discord.com/channels/'+guildId+'/'+ch.id});
};