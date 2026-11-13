const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
  ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder
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
    v('━━━━━━━━━━━━', true),
    t('💬・discussion-support', true), t('💬・discussion-manager', true, true),
    v('━━━━━━━━━━━━━', true),
    t('📁・report-bug', true), t('📁・resources', true), t('📁・github', true),
    v('━━━━━━━━━━━━━━', true),
    t('🛡️・vocal-anticheat', true), t('⚙️・ticket-notif', true), v('🐍・report-bug', true),
    v('━━━━━━━━━━━━━━━', true),
    v('🔊・Bureau 1', true), v('🔊・Bureau 2', true),
    v('━━━━━━━━━━━━━━━━', true),
    v('🔊・Admin 1', true), v('🔊・Admin 2', true)
  ]},
  {name: 'Workspace', privateCategory: true, channels: [
    v('━━━━━━━━━━━━', true), v('🔨・Workspace 1', true), v('🔨・Workspace 2', true),
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

// Cette commande est destructrice : une confirmation écrite est obligatoire.
// Le snapshot envoyé en MP contient les noms/permissions, jamais les messages.
// Permissions vocales explicites : Support = Workspace et Admin 1/2 uniquement.
// Director, Head of Content, Developer et Staff Manager peuvent accéder à tous
// les salons vocaux Staff et Workspace. Customers et Visitors n'y ont pas accès.
function voiceOverwrites(guild, groupName, channelName) {
  const rules = [
    {id: guild.id, deny: [
      PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect
    ]}
  ];
  const staffFull = new Set(['Director', 'Head of Content', 'Developer', 'Staff Manager']);
  const supportAllowed = groupName === 'Workspace' || /^🔊・Admin [12]$/.test(channelName);
  for (const role of guild.roles.cache.values()) {
    if (role.id === guild.id || role.managed) continue;
    if (staffFull.has(role.name)) {
      rules.push({id: role.id, allow: [
        PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak, PermissionFlagsBits.Stream
      ]});
    } else if (role.name === 'Customer Support') {
      rules.push(supportAllowed
        ? {id: role.id, allow: [
          PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak, PermissionFlagsBits.Stream
        ]}
        : {id: role.id, deny: [
          PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect
        ]});
    }
  }
  return rules;
}

async function handle(interaction) {
  const isCommand = interaction.isChatInputCommand() && interaction.commandName === 'backupload';
  const isButton = interaction.isButton() && interaction.customId.startsWith('backupload:');
  const isModal = interaction.isModalSubmit() && interaction.customId.startsWith('backupload:execute:');
  if (!isCommand && !isButton && !isModal) return false;

  if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({content: '❌ Réservé aux administrateurs du serveur.', flags: MessageFlags.Ephemeral});
    return true;
  }

  if (isCommand) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('backupload:confirm:' + interaction.user.id)
        .setLabel('Tout supprimer et reconstruire').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('backupload:cancel:' + interaction.user.id)
        .setLabel('Annuler').setStyle(ButtonStyle.Secondary)
    );
    await interaction.reply({
      content: '⚠️ **RÉINITIALISATION COMPLÈTE de ' + interaction.guild.name + '**\n' +
        'Cette action SUPPRIME DÉFINITIVEMENT tous les salons et leurs messages, ainsi que tous les rôles supprimables et leurs attributions. ' +
        'Puis elle recrée ' + ROLE_SPECS.length + ' rôles, ' + GROUPS.length + ' catégories et ' +
        GROUPS.reduce((n, g) => n + g.channels.length, 0) + ' salons.\n' +
        'Les rôles @everyone et ceux gérés par Discord/les bots ne peuvent pas être supprimés. ' +
        'Un récapitulatif de la structure actuelle sera envoyé en MP avant toute suppression (sans les messages).\n' +
        '**Ne continue pas si tu veux conserver les anciens messages ou permissions.**',
      components: [row],
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  if (isButton) {
    const [, action, userId] = interaction.customId.split(':');
    if (interaction.user.id !== userId) {
      await interaction.reply({content: '❌ Cette confirmation ne vous appartient pas.', flags: MessageFlags.Ephemeral});
      return true;
    }
    if (action === 'cancel') {
      await interaction.update({content: 'Réinitialisation annulée. Aucun changement effectué.', components: []});
      return true;
    }
    if (action !== 'confirm') return true;
    const modal = new ModalBuilder()
      .setCustomId('backupload:execute:' + interaction.user.id)
      .setTitle('Confirmation de réinitialisation');
    const input = new TextInputBuilder()
      .setCustomId('confirmation')
      .setLabel('Écris SUPPRIMER pour confirmer')
      .setPlaceholder('SUPPRIMER')
      .setRequired(true)
      .setMinLength(9)
      .setMaxLength(9)
      .setStyle(TextInputStyle.Short);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
    return true;
  }

  const userId = interaction.customId.split(':')[2];
  if (interaction.user.id !== userId) {
    await interaction.reply({content: '❌ Confirmation invalide.', flags: MessageFlags.Ephemeral});
    return true;
  }
  if (interaction.fields.getTextInputValue('confirmation').trim() !== 'SUPPRIMER') {
    await interaction.reply({content: '❌ Mot de confirmation incorrect. Aucun changement effectué.', flags: MessageFlags.Ephemeral});
    return true;
  }
  if (running.has(interaction.guildId)) {
    await interaction.reply({content: '⏳ Une réinitialisation est déjà en cours.', flags: MessageFlags.Ephemeral});
    return true;
  }

  running.add(interaction.guildId);
  await interaction.deferReply({flags: MessageFlags.Ephemeral});
  const guild = interaction.guild;
  let deletedChannels = 0, deletedRoles = 0, rolesCreated = 0, categories = 0, channels = 0;
  let dm = null;
  try {
    const bot = await guild.members.fetchMe();
    if (!bot.permissions.has(PermissionFlagsBits.ManageChannels) ||
        !bot.permissions.has(PermissionFlagsBits.ManageRoles))
      throw new Error('Le bot doit posséder Gérer les salons et Gérer les rôles.');
    await guild.channels.fetch();
    await guild.roles.fetch();

    const rolesToDelete = [...guild.roles.cache.values()]
      .filter(role => role.id !== guild.id && !role.managed);
    const blocked = rolesToDelete.filter(role => bot.roles.highest.comparePositionTo(role) <= 0);
    if (blocked.length)
      throw new Error('Impossible de supprimer certains rôles au-dessus du bot : ' +
        blocked.map(role => role.name).slice(0, 8).join(', ') +
        '. Place le rôle du bot plus haut dans la hiérarchie, puis réessaie.');

    // Certains salons communautaires doivent être dissociés des réglages Discord.
    const protectedIds = [guild.rulesChannelId, guild.publicUpdatesChannelId, guild.safetyAlertsChannelId]
      .filter(Boolean);
    if (protectedIds.some(id => guild.channels.cache.has(id)))
      throw new Error('Ce serveur possède des salons configurés comme règles/annonces de communauté/sécurité. ' +
        'Dissocie-les dans les paramètres du serveur avant de lancer la réinitialisation.');

    const existingChannels = [...guild.channels.cache.values()];
    for (const ch of existingChannels) {
      if (!ch.manageable) throw new Error('Le bot ne peut pas gérer le salon : ' + ch.name);
    }

    const snapshot = {
      server: guild.name,
      createdAt: new Date().toISOString(),
      note: 'Sauvegarde de structure uniquement. Les messages ne sont PAS sauvegardés.',
      roles: [...guild.roles.cache.values()].map(role => ({
        id: role.id, name: role.name, color: role.hexColor, position: role.position,
        permissions: role.permissions.bitfield.toString(), managed: role.managed
      })),
      channels: existingChannels.map(ch => ({
        id: ch.id, name: ch.name, type: ch.type, parentId: ch.parentId,
        permissionOverwrites: [...ch.permissionOverwrites.cache.values()].map(p => ({
          id: p.id, type: p.type, allow: p.allow.bitfield.toString(), deny: p.deny.bitfield.toString()
        }))
      }))
    };
    const archive = new AttachmentBuilder(Buffer.from(JSON.stringify(snapshot, null, 2), 'utf8'), {
      name: 'structure-avant-backupload.json'
    });
    try {
      dm = await interaction.user.createDM();
      await dm.send({
        content: '⚠️ Réinitialisation demandée sur **' + guild.name +
          '**. Voici la structure précédente (salons, rôles et permissions, sans les messages).',
        files: [archive]
      });
    } catch {
      throw new Error('Impossible de t’envoyer la sauvegarde de structure en MP. Ouvre tes MP puis réessaie. Rien n’a été supprimé.');
    }

    // Les enfants d'abord, puis les catégories.
    const ordered = existingChannels.sort((a, b) =>
      Number(a.type === ChannelType.GuildCategory) - Number(b.type === ChannelType.GuildCategory)
    );
    for (const ch of ordered) {
      await ch.delete('Réinitialisation /backupload confirmée');
      deletedChannels++;
    }
    for (const role of rolesToDelete.sort((a, b) => b.position - a.position)) {
      await role.delete('Réinitialisation /backupload confirmée');
      deletedRoles++;
    }

    // Discord conserve @everyone et les rôles gérés par les intégrations.
    await guild.roles.fetch();
    for (const spec of [...ROLE_SPECS].reverse()) {
      await guild.roles.create({
        name: spec.name, color: spec.color, hoist: true, mentionable: false,
        permissions: 0n, reason: 'Reconstruction /backupload'
      });
      rolesCreated++;
    }
    await guild.roles.fetch();

    for (const group of GROUPS) {
      const category = await guild.channels.create({
        name: group.name,
        type: ChannelType.GuildCategory,
        permissionOverwrites: overwrites(guild, !!group.privateCategory),
        reason: 'Reconstruction /backupload'
      });
      categories++;
      for (const channel of group.channels) {
        await guild.channels.create({
          name: channel.name, type: channel.type, parent: category.id,
          permissionOverwrites: channel.type === VOICE
            ? voiceOverwrites(guild, group.name, channel.name)
            : overwrites(guild, !!channel.privateChannel, !!channel.managerOnly),
          reason: 'Reconstruction /backupload'
        });
        channels++;
      }
    }

    const result = '✅ **Réinitialisation terminée sur ' + guild.name + '** : ' +
      deletedChannels + ' anciens salons et ' + deletedRoles + ' anciens rôles supprimés ; ' +
      rolesCreated + ' rôles, ' + categories + ' catégories et ' + channels + ' salons créés.\n' +
      'Les nouveaux rôles ne sont pas automatiquement attribués aux membres. Les Customer Support ont accès uniquement aux vocaux Workspace et Admin 1/2. ' +
      'Vérifie les permissions, la hiérarchie et les paramètres des autres bots.';
    await dm.send(result).catch(() => {});
    await interaction.editReply(result).catch(() => {});
  } catch (error) {
    console.error('[BACKUPLOAD]', error);
    const message = '❌ Réinitialisation interrompue. ' +
      deletedChannels + ' salons et ' + deletedRoles + ' rôles supprimés ; ' +
      rolesCreated + ' rôles, ' + categories + ' catégories et ' + channels + ' salons recréés.\n' +
      String(error.message).slice(0, 350);
    if (dm) await dm.send(message).catch(() => {});
    await interaction.editReply(message).catch(() => {});
  } finally {
    running.delete(interaction.guildId);
  }
  return true;
}

module.exports = {command, handle};
