const INVITE='pPjbT5F79a';
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=300');
  try{
    const r=await fetch(`https://discord.com/api/v10/invites/${INVITE}?with_counts=true`);
    if(!r.ok)return res.status(502).json({ok:false});
    const d=await r.json();
    res.status(200).json({
      ok:true,
      name:d.guild?.name||'PlayWise',
      guildId:d.guild?.id||null,
      icon:d.guild?.icon&&d.guild?.id?`https://cdn.discordapp.com/icons/${d.guild.id}/${d.guild.icon}.png?size=128`:null,
      members:d.approximate_member_count||0,
      online:d.approximate_presence_count||0,
      invite:`https://discord.gg/${INVITE}`
    });
  }catch(e){res.status(500).json({ok:false})}
};
