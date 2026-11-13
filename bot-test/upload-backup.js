const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags
} = require('discord.js');

// Modèle basé sur les captures fournies. Les séparateurs sont des salons textuels.
const TEXT = ChannelType.GuildText;
const VOICE = ChannelType.GuildVoice;
const t = (name, privateChannel = false, managerOnly = false) => ({name, type: TEXT, privateChannel, managerOnly});
const v = (name, privateChannel = false) => ({name, type: VOICE, privateChannel});
const ROLE_SPECS = [
  {name: 'Addveo', color: 0x5865F2},
  {name: 'Director', color: 0xF5A142},
  {name: 'Head of Content', color: 0xE58C53},
  {name: 'Developer', color: 0xE6A14A},
  {name: 'Staff Manager', color: 0xE6A14A},
  {name: 'Customer Support', color: 0xE6A14A},
  {name: 'Customers', color: 0xAAB1BD},
  {name: 'Visitors', color: 0xB8BAC5}
];
// Roles are cosmetic, with no elevated permissions.
const GROUPS = [
  {name: 'Staff', privateCategory: true, channels: [
    t('📢・announcements', true), t('🧩・infos', true),
    t('━━━━━━━━━━━━', true),
    t('💬・discussion-support', true), t('💬・discussion-manager', true, true),
    t('━━━━━━━━━━━━━', true),
    t('📁・report-bug', true), t('📁・resources', true), t('📁・github', true),
    t('━━━━━━━━━━━━━━', true),
    t('🛡️・vocal-anticheat', true), t('⚙️・ticket-notif', true), v('🐍・report-bug', true),
    t('━━━━━━━━━━━━━━━', true),
    v('🔊・Bureau 1', true), v('🔊・Bureau 2', true),
    t('━━━━━━━━━━━━━━━━', true),
    v('🔊・Admin 1', true), v('🔊・Admin 2', true)
  ]},
  {name: 'Workspace', privateCategory: true, channels: [
    v('🔨・Workspace 1', true), v('🔨・Workspace 2', true),
    v('🔨・Workspace 3', true), v('⏳・Waiting For Moove', true)
  ]},
  {name: 'Addveo Hub', channels: [
    t('📁・nos-offres'), t('📁・documentation')
  ]},
  {name: 'Community', channels: [
    t('📢・annonces'), t('🔗・nos-liens'), t('📝・recrutement'),
    t('📩・ticket'), t('🔍・découvrir'), t('📜・partners', true),
    t('🔨・updates'), t('🔗・social-media'), t('✨・avis')
  ]},
  {name: 'Customers', channels: [
    t('📢・announcements'), t('💬・discussion')
  ]}
];

const command = new SlashCommandBuilder()
  .setName('backupload')
  .setDescription('Installe les rôles, catégories et salons Addveo')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const running = new Set();

function overwrites(guild, privateChannel, managerOnly = false) {
  if (!privateChannel) return [];
  const allowed = guild.roles.cache.filter(role => {
    if (role.id === guild.id || role.managed) return false;
    const name = role.name.toLowerCase();
    return managerOnly
      ? /^(director|staff manager)$|manager|direction|responsable|administrateur|admin|owner|fondateur/.test(name)
      : /^(director|head of content|developer|staff manager|customer support)$|support|staff|moderat|manager|direction|responsable|administrateur|admin|owner|fondateur|developp/.test(name);
  });
  return [
    {id: guild.id, deny: [PermissionFlagsBits.ViewChannel]},
    ...allowed.map(role => ({id: role.id, allow: [PermissionFlagsBits.ViewChannel]}))
  ];
}

async function handle(interaction) {
  const isCommand = interaction.isChatInputCommand() && interaction.commandName === 'backupload';
  const isButton = interaction.isButton() && interaction.customId.startsWith('backupload:');
  if (!isCommand && !isButton) return false;

  if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({content: '❌ Commande réservée aux administrateurs.', flags: MessageFlags.Ephemeral});
    return true;
  }

  if (isCommand) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('backupload:confirm:' + interaction.user.id).setLabel('Installer la structure').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('backupload:cancel:' + interaction.user.id).setLabel('Annuler').setStyle(ButtonStyle.Secondary)
    );
    const count = GROUPS.reduce((total, group) => total + group.channels.length, 0);
    await interaction.reply({
      content: '📦 Installer jusqu’à **' + ROLE_SPECS.length + ' rôles**, **' + GROUPS.length + ' catégories** et **' + count +
        ' salons** sur **' + interaction.guild.name + '** ?\n' +
        'Aucun salon ni rôle existant ne sera supprimé. Les salons privés seront réservés aux rôles staff/manager reconnus et aux administrateurs. Vérifie les permissions après installation.',
      components: [row],
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  const [, action, userId] = interaction.customId.split(':');
  if (interaction.user.id !== userId) {
    await interaction.reply({content: '❌ Cette confirmation appartient à un autre utilisateur.', flags: MessageFlags.Ephemeral});
    return true;
  }
  if (action === 'cancel') {
    await interaction.update({content: 'Installation annulée.', components: []});
    return true;
  }
  if (action !== 'confirm') return true;
  if (running.has(interaction.guildId)) {
    await interaction.reply({content: '⏳ Une installation est déjà en cours.', flags: MessageFlags.Ephemeral});
    return true;
  }

  running.add(interaction.guildId);
  await interaction.update({content: '⏳ Création des rôles, catégories et salons en cours…', components: []});
  let rolesCreated = 0, rolesExisting = 0, categories = 0, channels = 0, skipped = 0;
  try {
    const guild = interaction.guild;
    const bot = await guild.members.fetchMe();
    if (!bot.permissions.has(PermissionFlagsBits.ManageChannels) || !bot.permissions.has(PermissionFlagsBits.ManageRoles))
      throw new Error('Le bot doit posséder les permissions Gérer les salons et Gérer les rôles.');
    await guild.channels.fetch();
    await guild.roles.fetch();

    // Create from lowest to highest for the intended display hierarchy.
    // Existing roles retain their permissions and positions.
    for (const spec of [...ROLE_SPECS].reverse()) {
      if (guild.roles.cache.some(role => role.name.toLowerCase() === spec.name.toLowerCase())) {
        rolesExisting++;
        continue;
      }
      await guild.roles.create({
        name: spec.name,
        color: spec.color,
        hoist: true,
        mentionable: false,
        permissions: 0n,
        reason: 'Backup Addveo /backupload'
      });
      rolesCreated++;
    }

    for (const group of GROUPS) {
      let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === group.name);
      if (!category) {
        category = await guild.channels.create({
          name: group.name,
          type: ChannelType.GuildCategory,
          permissionOverwrites: overwrites(guild, !!group.privateCategory),
          reason: 'Backup Addveo /backupload'
        });
        categories++;
      }
      for (const channel of group.channels) {
        const exists = guild.channels.cache.some(c =>
          c.type === channel.type && c.parentId === category.id && c.name === channel.name
        );
        if (exists) { skipped++; continue; }
        await guild.channels.create({
          name: channel.name,
          type: channel.type,
          parent: category.id,
          permissionOverwrites: overwrites(guild, !!channel.privateChannel, !!channel.managerOnly),
          reason: 'Backup Addveo /backupload'
        });
        channels++;
      }
    }
    await interaction.editReply('✅ Installation terminée : **' + rolesCreated + ' rôles**, **' +
      categories + ' catégories** et **' + channels + ' salons** créés (' + rolesExisting +
      ' rôles et ' + skipped + ' salons déjà présents). Aucun élément existant supprimé. ' +
      'Les rôles ne sont pas attribués automatiquement aux membres. Vérifie la hiérarchie et les permissions des salons existants.');
  } catch (error) {
    console.error('[BACKUPLOAD]', error);
    await interaction.editReply('⚠️ Installation interrompue après ' + rolesCreated + ' rôles, ' + categories +
      ' catégories et ' + channels + ' salons : ' + String(error.message).slice(0, 250) +
      '. Tu peux relancer /backupload : les salons existants seront conservés.').catch(() => {});
  } finally {
    running.delete(interaction.guildId);
  }
  return true;
}

module.exports = {command, handle};
