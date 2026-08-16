const crypto=require('node:crypto');
module.exports=(req,res)=>{
  const clientId=process.env.DISCORD_CLIENT_ID;
  if(!clientId)return res.status(500).send('DISCORD_CLIENT_ID manquant');
  const redirect='https://playwise-sable.vercel.app/api/discord/callback';
  const state=crypto.randomBytes(24).toString('hex');
  res.setHeader('Set-Cookie',`pw_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  const u=new URL('https://discord.com/oauth2/authorize');
  u.searchParams.set('client_id',clientId);
  u.searchParams.set('response_type','code');
  u.searchParams.set('redirect_uri',redirect);
  u.searchParams.set('scope','identify guilds');
  u.searchParams.set('state',state);
  res.redirect(u.toString());
};