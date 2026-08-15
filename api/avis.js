const crypto=require('node:crypto');

function verify(token,secret){
  try{
    if(!token||!secret)return null;
    const [p,s]=token.split('.');
    if(!p||!s)return null;
    const expected=crypto.createHmac('sha256',secret).update(p).digest('base64url');
    const a=Buffer.from(s),b=Buffer.from(expected);
    if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
    const obj=JSON.parse(Buffer.from(p,'base64url').toString());
    if(!obj.exp||Date.now()>obj.exp)return null;
    return obj;
  }catch{return null}
}

function cleanText(v,max){
  return String(v||'').replace(/\r/g,'').trim().slice(0,max);
}

module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Méthode non autorisée.'});

  const webhook=process.env.DISCORD_AVIS_WEBHOOK_URL||process.env.DISCORD_WEBHOOK_URL;
  const secret=process.env.DISCORD_CLIENT_SECRET;
  if(!webhook||!secret)return res.status(503).json({error:'Le système d’avis Discord n’est pas encore configuré.'});

  const cookies=req.headers.cookie||'';
  const match=cookies.match(/(?:^|; )pw_session=([^;]+)/);
  const user=verify(match?.[1],secret);
  if(!user)return res.status(401).json({error:'Connecte-toi avec Discord avant de publier un avis.'});

  let body=req.body;
  if(typeof body==='string'){
    try{body=JSON.parse(body)}catch{return res.status(400).json({error:'Requête invalide.'})}
  }
  body=body||{};

  if(String(body.website||'').trim())return res.status(200).json({ok:true});

  const rating=Number(body.rating);
  const message=cleanText(body.message,800);
  if(!Number.isInteger(rating)||rating<1||rating>5)return res.status(400).json({error:'Choisis une note entre 1 et 5 étoiles.'});
  if(message.length<10)return res.status(400).json({error:'Ton avis doit contenir au moins 10 caractères.'});

  const displayName=cleanText(user.global_name||user.username||'Membre PlayWise',80);
  const stars='⭐'.repeat(rating)+'☆'.repeat(5-rating);
  const payload={
    username:'PlayWise • Avis',
    allowed_mentions:{parse:[]},
    embeds:[{
      title:'💬 Nouvel avis PlayWise',
      description:message,
      color:2327551,
      author:{name:displayName,icon_url:user.avatarUrl||undefined},
      fields:[
        {name:'Note',value:`${stars}  •  ${rating}/5`,inline:true},
        {name:'Compte Discord',value:`<@${String(user.id).replace(/\D/g,'')}>`,inline:true}
      ],
      footer:{text:'Avis envoyé depuis PlayWise'},
      timestamp:new Date().toISOString()
    }]
  };

  try{
    const r=await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!r.ok){
      console.error('Webhook avis Discord:',r.status,await r.text().catch(()=>''));
      return res.status(502).json({error:'Discord n’a pas accepté l’avis. Vérifie le webhook.'});
    }
    return res.status(200).json({ok:true});
  }catch(e){
    console.error('Avis webhook error',e);
    return res.status(502).json({error:'Impossible de contacter Discord pour le moment.'});
  }
};
