const crypto=require('node:crypto');
const REDIRECT='https://playwise-sable.vercel.app/api/discord/callback';
const INVITE='pPjbT5F79a';
function esc(v){return String(v||'').replace(/[<>&"']/g,'')}
function sign(obj,secret){const p=Buffer.from(JSON.stringify(obj)).toString('base64url');const s=crypto.createHmac('sha256',secret).update(p).digest('base64url');return `${p}.${s}`}
function validState(state,secret){
  try{
    const [ts,nonce,sig]=String(state||'').split('.');
    if(!ts||!nonce||!sig)return false;
    const data=`${ts}.${nonce}`;
    const expected=crypto.createHmac('sha256',secret).update(data).digest('base64url');
    const a=Buffer.from(sig),b=Buffer.from(expected);
    if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return false;
    const age=Date.now()-parseInt(ts,36);
    return Number.isFinite(age)&&age>=0&&age<=10*60*1000;
  }catch{return false}
}
module.exports=async(req,res)=>{try{const {code,state}=req.query;const clientId=process.env.DISCORD_CLIENT_ID,secret=process.env.DISCORD_CLIENT_SECRET;if(!clientId||!secret)return res.status(500).send('Configuration Discord incomplète.');if(!code||!validState(state,secret))return res.status(400).send('Connexion invalide.');const body=new URLSearchParams({client_id:clientId,client_secret:secret,grant_type:'authorization_code',code:String(code),redirect_uri:REDIRECT});const tr=await fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});if(!tr.ok)return res.status(500).send('Erreur OAuth Discord.');const tok=await tr.json();const auth={Authorization:`Bearer ${tok.access_token}`};const [ur,gr,ir]=await Promise.all([fetch('https://discord.com/api/users/@me',{headers:auth}),fetch('https://discord.com/api/users/@me/guilds',{headers:auth}),fetch(`https://discord.com/api/v10/invites/${INVITE}?with_counts=true`)]);if(!ur.ok)return res.status(500).send('Profil Discord indisponible.');const user=await ur.json();const guilds=gr.ok?await gr.json():[];const invite=ir.ok?await ir.json():null;const guildId=invite?.guild?.id;const g=guildId?guilds.find(x=>x.id===guildId):null;let admin=false;if(g){let perms=0n;try{perms=BigInt(g.permissions||'0')}catch{}admin=!!g.owner||((perms&8n)===8n)}const avatarUrl=user.avatar?`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`:'https://cdn.discordapp.com/embed/avatars/0.png';const payload={id:user.id,username:esc(user.username),global_name:esc(user.global_name),avatarUrl,admin,exp:Date.now()+7*86400000};const session=sign(payload,secret);res.setHeader('Set-Cookie',`pw_session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`);res.redirect('/avis.html')}catch(e){res.status(500).send('Erreur pendant la connexion Discord.')}};