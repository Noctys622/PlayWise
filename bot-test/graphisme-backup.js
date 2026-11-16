const {ChannelType,PermissionFlagsBits,MessageFlags}=require('discord.js');
const groups=[
 {name:'📌・INFORMATIONS',channels:['📜・règlement','📢・annonces','📣・nouveautés','💎・tarifs','🔗・liens-utiles']},
 {name:'🎨・GRAPHISME',channels:['🖼️・portfolio','✨・logos','🌌・bannières','🧩・identités-visuelles','📸・vos-créations']},
 {name:'🛒・COMMANDES',channels:['📝・comment-commander','📩・ouvrir-un-ticket','📦・suivi-commandes','⭐・avis-clients']},
 {name:'💬・COMMUNAUTÉ',channels:['💬・général','💡・suggestions','📷・partage','🤝・partenariats','🔊・Discussion','🔊・Création']},
 {name:'🛡️・STAFF',private:true,channels:['💬・discussion-staff','📋・commandes-en-cours','📜・logs','📁・ressources','🔊・Réunion staff']}
];
const roles=[
 ['👑・Fondateur',0xF0B35A],['🛡️・Administrateur',0xD95B6B],
 ['🎨・Graphiste',0x9B7AE0],['🎫・Support',0x5A9CE0],
 ['💎・Client',0x67C7AE],['👤・Membre',0xA5AAB5]
];
const running=new Set();
async function handle(i){
 if(!i.inGuild()||!i.memberPermissions?.has(PermissionFlagsBits.Administrator)){
  await i.reply({content:'❌ Réservé aux administrateurs.',flags:MessageFlags.Ephemeral});return true;
 }
 if(running.has(i.guildId)){await i.reply({content:'⏳ Installation déjà en cours.',flags:MessageFlags.Ephemeral});return true;}
 running.add(i.guildId);await i.deferReply({flags:MessageFlags.Ephemeral});
 let made=0,rolesMade=0;
 try{
  const g=i.guild,bot=await g.members.fetchMe();
  if(!bot.permissions.has(PermissionFlagsBits.ManageChannels)||!bot.permissions.has(PermissionFlagsBits.ManageRoles))
   throw Error('Le bot doit avoir Gérer les salons et Gérer les rôles.');
  await g.channels.fetch();await g.roles.fetch();
  for(const [name,color] of roles){
   if(g.roles.cache.some(r=>r.name===name))continue;
   await g.roles.create({name,color,permissions:0n,reason:'Backup graphisme'});rolesMade++;
  }
  await g.roles.fetch();
  const staffRoles=g.roles.cache.filter(r=>/^(👑・Fondateur|🛡️・Administrateur|🎨・Graphiste|🎫・Support)$/.test(r.name));
  for(const group of groups){
   let cat=g.channels.cache.find(c=>c.type===ChannelType.GuildCategory&&c.name===group.name);
   const perms=group.private?[{id:g.id,deny:[PermissionFlagsBits.ViewChannel]},...staffRoles.map(r=>({id:r.id,allow:[PermissionFlagsBits.ViewChannel]}))]:[];
   if(!cat){cat=await g.channels.create({name:group.name,type:ChannelType.GuildCategory,permissionOverwrites:perms,reason:'Backup graphisme'});made++;}
   for(const name of group.channels){
    if(g.channels.cache.some(c=>c.parentId===cat.id&&c.name===name))continue;
    const voice=name.startsWith('🔊');
    const readOnly=/^(📜・règlement|📢・annonces|📣・nouveautés|💎・tarifs|🔗・liens-utiles|📝・comment-commander|🖼️・portfolio)$/.test(name);
    const overwrites=group.private?perms:(readOnly?[{id:g.id,deny:[PermissionFlagsBits.SendMessages]}]:[]);
    await g.channels.create({name,type:voice?ChannelType.GuildVoice:ChannelType.GuildText,parent:cat.id,permissionOverwrites:overwrites,reason:'Backup graphisme'});made++;
   }
  }
  await i.editReply('✅ Backup Graphisme installée : '+made+' salons/catégories et '+rolesMade+' rôles créés. Aucun salon existant supprimé. Les rôles ne sont pas attribués automatiquement.');
 }catch(e){console.error('[BACKUP GRAPHISME]',e);await i.editReply('❌ Installation interrompue : '+String(e.message).slice(0,350));}
 finally{running.delete(i.guildId);}
 return true;
}
module.exports={handle};
