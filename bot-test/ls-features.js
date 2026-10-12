const { SlashCommandBuilder, PermissionFlagsBits: P, ChannelType, EmbedBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const STORE = path.join(__dirname, 'ls-settings.json');
let settings = {};
try { settings = JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch {}
function save() { try { fs.writeFileSync(STORE, JSON.stringify(settings, null, 2)); } catch(e) { console.warn('[LS] Configuration non persistée:', e.message); } }
function config(id) { return settings[id] ||= {}; }
const admin = c => c.setDefaultMemberPermissions(P.Administrator).setDMPermission(false);
const commands = [
 admin(new SlashCommandBuilder().setName('setautorole').setDescription('Rôle attribué aux nouveaux membres').addRoleOption(o=>o.setName('role').setDescription('Rôle à attribuer').setRequired(true))),
 admin(new SlashCommandBuilder().setName('setwelcome').setDescription('Salon des messages de bienvenue').addChannelOption(o=>o.setName('salon').setDescription('Salon texte').addChannelTypes(ChannelType.GuildText).setRequired(true))),
 admin(new SlashCommandBuilder().setName('setlog').setDescription('Salon des journaux LS Custom').addChannelOption(o=>o.setName('salon').setDescription('Salon texte').addChannelTypes(ChannelType.GuildText).setRequired(true))),
 admin(new SlashCommandBuilder().setName('lsconfig').setDescription('Afficher la configuration LS Custom')),
 admin(new SlashCommandBuilder().setName('lsreset').setDescription('Désactiver une option LS Custom').addStringOption(o=>o.setName('option').setDescription('Option à retirer').setRequired(true).addChoices({name:'Rôle automatique',value:'autorole'},{name:'Bienvenue',value:'welcome'},{name:'Logs',value:'log'}))),
 admin(new SlashCommandBuilder().setName('recrutement').setDescription('Publier une annonce de recrutement LS Custom').addStringOption(o=>o.setName('message').setDescription('Détails du recrutement').setRequired(true))),
 admin(new SlashCommandBuilder().setName('lsannonce').setDescription('Publier une annonce garage').addStringOption(o=>o.setName('titre').setDescription('Titre').setRequired(true)).addStringOption(o=>o.setName('message').setDescription('Contenu').setRequired(true))),
 admin(new SlashCommandBuilder().setName('lsstaff').setDescription('Afficher les employés du garage').addRoleOption(o=>o.setName('role').setDescription('Rôle des employés').setRequired(true)))
];
async function log(guild, title, description) {
 const id = config(guild.id).log; if(!id) return;
 const ch = await guild.channels.fetch(id).catch(()=>null);
 if(ch?.isTextBased()) await ch.send({embeds:[new EmbedBuilder().setColor(0x5865f2).setTitle(title).setDescription(description).setTimestamp()]}).catch(()=>{});
}
async function handle(interaction) {
 if(!interaction.isChatInputCommand() || !commands.some(c=>c.name===interaction.commandName)) return false;
 if(!interaction.inGuild() || !interaction.memberPermissions?.has(P.Administrator)) {
   await interaction.reply({content:'❌ Commande réservée aux administrateurs.',ephemeral:true});return true;
 }
 const name=interaction.commandName,g=interaction.guild,c=config(g.id);
 try {
 if(name==='lsconfig') await interaction.reply({content:`⚙️ **LS Custom**\nRôle automatique : ${c.autorole?'<@&'+c.autorole+'>':'désactivé'}\nBienvenue : ${c.welcome?'<#'+c.welcome+'>':'désactivé'}\nLogs : ${c.log?'<#'+c.log+'>':'désactivé'}`,ephemeral:true});
 else if(name==='lsreset') {const key=interaction.options.getString('option',true);delete c[key];save();await interaction.reply({content:'✅ Option désactivée.',ephemeral:true});}
 else if(name==='setautorole') {
   const role=interaction.options.getRole('role',true),me=await g.members.fetchMe();
   if(role.id===g.id || role.managed || role.position>=me.roles.highest.position) return await interaction.reply({content:'❌ Le rôle doit être attribuable et inférieur au rôle du bot.',ephemeral:true}),true;
   c.autorole=role.id;save();await interaction.reply({content:'✅ Rôle automatique : '+role.name,ephemeral:true});
 } else if(name==='setwelcome'||name==='setlog') {
   const channel=interaction.options.getChannel('salon',true);
   c[name==='setwelcome'?'welcome':'log']=channel.id;save();await interaction.reply({content:'✅ Salon configuré : <#'+channel.id+'>',ephemeral:true});
 } else if(name==='lsstaff') {
   const role=interaction.options.getRole('role',true);
   await g.members.fetch();
   const members=g.members.cache.filter(m=>m.roles.cache.has(role.id));
   await interaction.reply({content:'👥 **Personnel LS Custom — '+role.name+'**\n'+(members.size?members.map(m=>'<@'+m.id+'>').slice(0,40).join('\n'):'Aucun employé trouvé.'),ephemeral:true});
 } else {
   const title=name==='recrutement'?'📋 LS Custom recrute !':interaction.options.getString('titre',true);
   const message=interaction.options.getString('message',true);
   await interaction.channel.send({embeds:[new EmbedBuilder().setColor(0x3498db).setTitle(title).setDescription(message).setFooter({text:'LS Custom • Direction'}).setTimestamp()]});
   await interaction.reply({content:'✅ Annonce publiée.',ephemeral:true});
 }
 if(name!=='lsconfig'&&name!=='lsstaff') await log(g,'⚙️ LS Custom','Commande /'+name+' exécutée par <@'+interaction.user.id+'>');
 } catch(e) {console.error('[LS]',e);if(!interaction.replied) await interaction.reply({content:'❌ Action impossible : vérifie les permissions du bot.',ephemeral:true}).catch(()=>{});}
 return true;
}
function attach(client) {
 client.on('guildMemberAdd',async member=>{
   const c=config(member.guild.id);
   if(c.autorole) await member.roles.add(c.autorole,'LS Custom : rôle automatique').catch(e=>console.warn('[LS autorole]',e.message));
   if(c.welcome) {const ch=await member.guild.channels.fetch(c.welcome).catch(()=>null);
     await ch?.send({content:'👋 Bienvenue <@'+member.id+'> chez **LS Custom** !'}).catch(()=>{});}
   await log(member.guild,'📥 Arrivée','<@'+member.id+'> a rejoint le serveur.');
 });
 client.on('guildMemberRemove',m=>log(m.guild,'📤 Départ','<@'+m.id+'> a quitté le serveur.'));
}
module.exports={commands,handle,attach};
