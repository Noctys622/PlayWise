const crypto=require('node:crypto');
const hits=new Map();
const CATEGORIES=new Set(['Problème avec le site','Guide / jeu','Compte Discord','Partenariat','Autre']);

function verify(token,secret){
  try{
    if(!token||!secret)return null;
    const [p,s]=token.split('.');
    if(!p||!s)return null;
    const expected=crypto.createHmac('sha256',secret).update(p).digest('base64url');
    const a=Buffer.from(s),b=Buffer.from(expected);
    if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
    const o=JSON.parse(Buffer.from(p,'base64url').toString());
    return o.exp>Date.now()?o:null;
  }catch{return null}
}
function clean(v,n){return String(v??'').replace(/\r/g,'').trim().slice(0,n)}
function signTicket(obj,secret){
  const p=Buffer.from(JSON.stringify(obj)).toString('base64url');
  const s=crypto.createHmac('sha256',secret).update(p).digest('base64url');
  return p+'.'+s;
}

module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST')return res.status(405).json({error:'Méthode non autorisée.'});

  const secret=process.env.DISCORD_CLIENT_SECRET;
  if(!secret)return res.status(503).json({error:'La connexion Discord n’est pas configurée.'});

  const cookie=req.headers.cookie||'';
  const m=cookie.match(/(?:^|; )pw_session=([^;]+)/);
  const u=verify(m?.[1],secret);
  if(!u)return res.status(401).json({error:'Connecte-toi avec Discord avant de contacter le support.'});

  const now=Date.now(),key=String(u.id||'');
  const last=hits.get(key)||0;
  if(now-last<120000)return res.status(429).json({error:'Patiente un peu avant d’envoyer une nouvelle demande.'});

  let b=req.body;
  if(typeof b==='string')try{b=JSON.parse(b)}catch{return res.status(400).json({error:'Requête invalide.'})}

  const category=clean(b?.category,60);
  const subject=clean(b?.subject,100);
  const message=clean(b?.message,1200);

  if(!CATEGORIES.has(category))return res.status(400).json({error:'Catégorie invalide.'});
  if(subject.length<3)return res.status(400).json({error:'Le sujet doit contenir au moins 3 caractères.'});
  if(message.length<10)return res.status(400).json({error:'Le message doit contenir au moins 10 caractères.'});

  const hook=process.env.DISCORD_SUPPORT_WEBHOOK_URL||process.env.DISCORD_WEBHOOK_URL;
  if(!hook)return res.status(503).json({error:'Le canal de support Discord n’est pas encore configuré.'});

  const ticket={
    uid:String(u.id),
    username:u.global_name||u.username||'Utilisateur',
    category,subject,message,
    createdAt:Date.now(),
    exp:Date.now()+7*86400000
  };
  const token=signTicket(ticket,secret);
  const base=process.env.PLAYWISE_BASE_URL||'https://playwise-sable.vercel.app';
  const acceptUrl=base+'/admin.html?ticket='+encodeURIComponent(token);

  let r;
  try{
    r=await fetch(hook,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        username:'PlayWise • Support',
        allowed_mentions:{parse:[]},
        embeds:[{
          title:'🛟 '+subject,
          description:message,
          color:3894527,
          author:{name:ticket.username,icon_url:u.avatarUrl||undefined},
          fields:[
            {name:'Catégorie',value:category,inline:true},
            {name:'Utilisateur Discord',value:'<@'+String(u.id).replace(/\D/g,'')+'>',inline:true},
            {name:'ID Discord',value:String(u.id).replace(/\D/g,'')||'—',inline:false},
            {name:'Action staff',value:'[✅ Accepter le ticket]('+acceptUrl+')',inline:false}
          ],
          footer:{text:'PlayWise Support • Ticket en attente'},
          timestamp:new Date().toISOString()
        }]
      })
    });
  }catch{}

  if(!r?.ok)return res.status(502).json({error:'Discord n’a pas accepté la demande. Réessaie dans quelques instants.'});
  hits.set(key,now);
  return res.status(200).json({ok:true});
};