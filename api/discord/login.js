const crypto=require('node:crypto');
const REDIRECT='https://playwise-sable.vercel.app/api/discord/callback';
function safeNext(v){const s=String(v||'');return /^\/[a-zA-Z0-9/_\-.]*$/.test(s)?s:'/avis.html'}
function makeState(secret,next){const ts=Date.now().toString(36);const nonce=crypto.randomBytes(18).toString('base64url');const dest=Buffer.from(safeNext(next)).toString('base64url');const data=`${ts}.${nonce}.${dest}`;const sig=crypto.createHmac('sha256',secret).update(data).digest('base64url');return `${data}.${sig}`}
module.exports=(req,res)=>{const clientId=process.env.DISCORD_CLIENT_ID,secret=process.env.DISCORD_CLIENT_SECRET;if(!clientId||!secret)return res.status(500).send('Configuration Discord incomplète.');
 const state=makeState(secret,req.query?.next);
 const u=new URL('https://discord.com/oauth2/authorize');u.searchParams.set('client_id',clientId);u.searchParams.set('response_type','code');u.searchParams.set('redirect_uri',REDIRECT);u.searchParams.set('scope','identify guilds');u.searchParams.set('state',state);res.setHeader('Cache-Control','no-store');res.redirect(u.toString());};