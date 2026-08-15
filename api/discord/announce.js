const crypto=require('node:crypto');
function verify(token,secret){
  if(!token||!secret)return null;
  const [p,s]=token.split('.');
  if(!p||!s)return null;
  const e=crypto.createHmac('sha256',secret).update(p).digest('base64url');
  const a=Buffer.from(s),b=Buffer.from(e);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
  try{const o=JSON.parse(Buffer.from(p,'base64url').toString());if(!o.exp||Date.now()>o.exp)return null;return o}catch{return null}
}
module.exports=async(req,res)=>{
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Méthode non autorisée'});
  const c=req.headers.cookie||'';
  const m=c.match(/(?:^|; )pw_session=([^;]+)/);
  const user=verify(m?.[1],process.env.DISCORD_CLIENT_SECRET);
  if(!user?.admin)return res.status(403).json({ok:false,error:'Accès administrateur requis'});
  const webhook=process.env.DISCORD_WEBHOOK_URL;
  if(!webhook)return res.status(503).json({ok:false,error:'DISCORD_WEBHOOK_URL manquant dans Vercel'});
  const {title,message,url}=req.body||{};
  if(!title||!message)return res.status(400).json({ok:false,error:'Titre et message requis'});
  const embed={title:String(title).slice(0,256),description:String(message).slice(0,4000),color:0x2383ff,footer:{text:`Publié depuis PlayWise par ${user.global_name||user.username}`},timestamp:new Date().toISOString()};
  if(url)embed.url=String(url).slice(0,2000);
  try{
    const r=await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'PlayWise',embeds:[embed]})});
    if(!r.ok)return res.status(502).json({ok:false,error:'Discord a refusé le webhook'});
    res.status(200).json({ok:true});
  }catch(e){res.status(500).json({ok:false,error:'Erreur lors de l’envoi'})}
};
