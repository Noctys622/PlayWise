const {SlashCommandBuilder,PermissionFlagsBits,ChannelType}=require('discord.js');
const command=new SlashCommandBuilder().setName('backupillegal').setDescription('Installer les salons du Discord Gestion Illégale RP').setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
const groups=[
 ['📌 Général',['📢・annonces','📢・actualités','🔪・évènements-illégal','📷・concours-photo','📜・règlement-illégal','👤・demande-roles','🙋・recherche-groupes','📃・suggestion','💬・général-hrp','📸・screens-jeu','🎞️・best-of-groupe','💡・suggestions-illégale']],
 ['🔎 Guide Illégal',['🗡️・activités-illégales','🏴・organisations','🔫・armement','💵・blanchiment','🧪・laboratoires','🔥・points-chauds']],
 ['Histoire organisations',['🟢families','🔴ballas','🟢blue-kings','🟢red-kings','🔴aztecas','🔴vagos','🔴the-lost-mc','🔴mafia-armenienne','🟢los-santos-triades','🔴cartel-madrazo','🟢famille-bonelli','🟢famille-brokers','🔴duggan-crime-family','🟢marabunta']],
 ['👥 〉Groupes Officiels',['⚔️・legacy-contender','Réunion Hebdomadaire Illégale']]
];
const running=new Set();
async function handle(i){
 if(!i.isChatInputCommand()||i.commandName!=='backupillegal')return false;
 if(!i.inGuild()||!i.memberPermissions?.has(PermissionFlagsBits.Administrator)){await i.reply({content:'❌ Réservé aux administrateurs.',ephemeral:true});return true;}
 if(running.has(i.guildId)){await i.reply({content:'⏳ Installation déjà en cours.',ephemeral:true});return true;}
 running.add(i.guildId);await i.deferReply({ephemeral:true});
 try{
  const g=i.guild,me=await g.members.fetchMe();
  if(!me.permissions.has(PermissionFlagsBits.ManageChannels)||!me.permissions.has(PermissionFlagsBits.ManageRoles))throw Error('Le bot doit pouvoir gérer les salons et les rôles.');
  await g.channels.fetch();await g.roles.fetch();
  const roleNames=['👑 Responsable Illégal','🛡️ Staff Illégal','👥 Chef de groupe','👤 Membre de groupe'];
  let rolesMade=0,channelsMade=0;
  for(const name of roleNames)if(!g.roles.cache.some(r=>r.name===name)){await g.roles.create({name,permissions:0n,reason:'Installation gestion illégale RP'});rolesMade++;}
  for(const [categoryName,channels] of groups){
   let category=g.channels.cache.find(c=>c.type===ChannelType.GuildCategory&&c.name===categoryName);
   if(!category){category=await g.channels.create({name:categoryName,type:ChannelType.GuildCategory,reason:'Backup gestion illégale RP'});channelsMade++;}
   for(const name of channels){
    const voice=name.startsWith('Réunion Hebdomadaire');
    if(g.channels.cache.some(c=>c.parentId===category.id&&c.name===name))continue;
    const readOnly=['📢・annonces','📢・actualités','🔪・évènements-illégal','📜・règlement-illégal','🗡️・activités-illégales','🏴・organisations','🔫・armement','💵・blanchiment','🧪・laboratoires'].includes(name);
    const permissionOverwrites=readOnly?[{id:g.id,deny:[PermissionFlagsBits.SendMessages]}]:[];
    await g.channels.create({name,type:voice?ChannelType.GuildVoice:ChannelType.GuildText,parent:category.id,permissionOverwrites,reason:'Backup gestion illégale RP'});
    channelsMade++;
   }
  }
  await i.editReply('✅ Backup illégal installé : '+channelsMade+' salons/catégories et '+rolesMade+' rôles créés. Aucun salon existant supprimé.');
 }catch(e){console.error('[BACKUP ILLEGAL]',e);await i.editReply('❌ Installation interrompue : '+e.message+' Tu peux relancer /backupillegal sans recréer les salons déjà installés.');}
 finally{running.delete(i.guildId);}
 return true;
}
module.exports={command,handle};
