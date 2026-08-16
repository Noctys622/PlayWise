const crypto=require('node:crypto');

function makeState(secret){
  const ts=Date.now().toString(36);
  const nonce=crypto.randomBytes(18).toString('base64url');
  const data=`${ts}.${nonce}`;
  const sig=crypto.createHmac('sha256',secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

module.exports=(req,res)=>{
  const clientId=process.env.DISCORD_CLIENT_ID;
  const secret=process.env.DISCORD_CLIENT_SECRET;
  if(!clientId||!secret)return res.status(500).send('Configuration Discord incomplète.');

  const redirect='https://playwise-sable.vercel.app/api/discord/callback';
  const state=makeState(secret);
  const u=new URL('https://discord.com/oauth2/authorize');
  u.searchParams.set('client_id',clientId);
  u.searchParams.set('response_type','code');
  u.searchParams.set('redirect_uri',redirect);
  u.searchParams.set('scope','identify guilds');
  u.searchParams.set('state',state);
  res.setHeader('Cache-Control','no-store');
  res.redirect(u.toString());
};