const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const GROUPS = [
  {
    "name": "📌・INFORMATIONS",
    "channels": [
      "📢・annonces",
      "📑・sommaire",
      "🔗・liens-utiles"
    ]
  },
  {
    "name": "📖・ADDVEO",
    "channels": [
      "👥・recrutement",
      "💵・achat-base",
      "💸・apres-achat-base",
      "🤑・moyen-de-paiement",
      "📘・documentation-addveo",
      "📌・ping-dev",
      "⚙️・configuration-base",
      "🔄・mises-a-jour",
      "📋・reponses-types",
      "💡・informations-utiles"
    ]
  },
  {
    "name": "📋・TEMPLATES GTA RP",
    "channels": [
      "👮・lspd",
      "🚔・bcso",
      "⭐・sasp",
      "🚑・ems",
      "🚒・pompiers",
      "🔧・mecano",
      "🚗・concessionnaire",
      "🚕・taxi",
      "🏛️・gouvernement",
      "⚖️・justice",
      "📰・weazel-news",
      "🏠・immobilier",
      "🍔・restaurants",
      "🍹・bars",
      "🛒・commerces",
      "🎰・casino",
      "🏢・entreprises",
      "💊・organisations-illegales",
      "🔫・gangs",
      "📦・autres-templates"
    ]
  },
  {
    "name": "📚・GUIDES & TUTORIELS",
    "channels": [
      "📘・guides-fivem",
      "🖥️・installation-serveur",
      "⚙️・configurations",
      "🛠️・resolutions-bugs",
      "💻・developpement",
      "🎮・astuces-gta"
    ]
  },
  {
    "name": "🎨・PACKS GRAPHIQUES",
    "channels": [
      "🌈・packs-graphiques",
      "✨・reshade",
      "🌅・presets",
      "🌴・vegetation",
      "🌧️・meteo-et-ciel",
      "💡・lumieres",
      "🖼️・textures",
      "📸・screenshots"
    ]
  },
  {
    "name": "📦・RESSOURCES FIVEM",
    "channels": [
      "📜・scripts",
      "🗺️・mappings",
      "🚘・vehicules",
      "🧍・peds",
      "👕・vetements",
      "🔫・armes",
      "📱・interfaces",
      "🎯・hud-et-viseurs",
      "🔊・sons",
      "📁・autres-ressources"
    ]
  },
  {
    "name": "🔧・OUTILS & LOGICIELS",
    "channels": [
      "🛠️・outils-fivem",
      "🗺️・codewalker",
      "🧊・blender",
      "🎨・photoshop",
      "💻・visual-studio-code",
      "📦・logiciels-utiles"
    ]
  },
  {
    "name": "🔒・STOCKAGE PRIVÉ",
    "channels": [
      "📂・fichiers-personnels",
      "📁・projets-en-cours",
      "💾・sauvegardes",
      "📝・notes",
      "🔗・liens-a-conserver"
    ]
  }
];
const command = new SlashCommandBuilder().setName('backuptemp').setDescription('Installe les catégories et salons de stockage GTA RP').setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
const pending = new Set();
async function handle(interaction) {
  const isCommand = interaction.isChatInputCommand() && interaction.commandName === 'backuptemp';
  const isButton = interaction.isButton() && interaction.customId.startsWith('backuptemp:');
  if (!isCommand && !isButton) return false;
  if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({content:'❌ Réservé aux administrateurs du serveur.',flags:MessageFlags.Ephemeral}); return true;
  }
  if (isCommand) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('backuptemp:confirm:'+interaction.user.id).setLabel('Créer les salons').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('backuptemp:cancel:'+interaction.user.id).setLabel('Annuler').setStyle(ButtonStyle.Secondary));
    await interaction.reply({content:'📦 Installer '+GROUPS.length+' catégories et '+GROUPS.reduce((n,g)=>n+g.channels.length,0)+' salons sur **'+interaction.guild.name+'** ? Aucun salon existant ne sera supprimé.',components:[row],flags:MessageFlags.Ephemeral}); return true;
  }
  const [,action,userId] = interaction.customId.split(':');
  if (interaction.user.id !== userId) { await interaction.reply({content:'❌ Cette confirmation ne vous appartient pas.',flags:MessageFlags.Ephemeral}); return true; }
  if (action === 'cancel') {await interaction.update({content:'Installation annulée.',components:[]});return true;}
  if (pending.has(interaction.guildId)) {await interaction.reply({content:'Installation déjà en cours.',flags:MessageFlags.Ephemeral});return true;}
  pending.add(interaction.guildId);
  await interaction.update({content:'⏳ Installation en cours…',components:[]});
  let categories=0,channels=0;
  try {
    const guild=interaction.guild;
    await guild.channels.fetch();
    for(const group of GROUPS) {
      let category=guild.channels.cache.find(c=>c.type===ChannelType.GuildCategory&&c.name===group.name);
      if(!category){category=await guild.channels.create({name:group.name,type:ChannelType.GuildCategory,reason:'BackupTemp'});categories++;}
      for(const name of group.channels) {
        if(guild.channels.cache.some(c=>c.type===ChannelType.GuildText&&c.parentId===category.id&&c.name===name))continue;
        await guild.channels.create({name,type:ChannelType.GuildText,parent:category.id,reason:'BackupTemp'});channels++;
      }
    }
    await interaction.editReply('✅ Terminé : '+categories+' catégories et '+channels+' salons créés. Les éléments déjà présents ont été conservés.');
  }catch(error){console.error('[BACKUPTEMP]',error);await interaction.editReply('⚠️ Installation interrompue après '+categories+' catégories et '+channels+' salons : '+error.message.slice(0,300)).catch(()=>{});}
  finally{pending.delete(interaction.guildId);}
  return true;
}
module.exports={command,handle};
