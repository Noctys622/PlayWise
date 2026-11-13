const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

const PANEL_CHANNEL_ID = '1570930108339060898';
const SUPPORT_ROLE_ID = '1570889712179224658';
const AUTO_MARK = /(?:^|\n)\[ATLAS_AUTOROLE:(\d{17,20})\]/;
const TICKET_MARK = /^ATLAS_TICKET:(\d{17,20})$/;

const commands = [
  new SlashCommandBuilder().setName('autorole').setDescription('Configure le rôle donné automatiquement aux nouveaux membres')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(s => s.setName('role').setDescription('Choisir le rôle automatique')
      .addRoleOption(o => o.setName('role').setDescription('Rôle à donner aux nouveaux membres').setRequired(true)))
    .addSubcommand(s => s.setName('disable').setDescription('Désactiver le rôle automatique'))
    .addSubcommand(s => s.setName('status').setDescription('Afficher le rôle automatique')),
  new SlashCommandBuilder().setName('ticket').setDescription('Publier le panneau de tickets Atlas Studio')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map(c => c.setDMPermission(false).toJSON());

function settingsChannel(guild) {
  const channel = guild.channels.cache.get(PANEL_CHANNEL_ID);
  if (channel?.type === ChannelType.GuildText) return channel;
  return guild.channels.cache.filter(c => c.type === ChannelType.GuildText &&
    c.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.ManageChannels))
    .sort((a,b) => a.rawPosition - b.rawPosition).first() || null;
}
async function autoroleId(guild) {
  await guild.channels.fetch().catch(() => {});
  const channel = settingsChannel(guild);
  if (!channel) return null;
  const fresh = await guild.channels.fetch(channel.id).catch(() => channel);
  return fresh.topic?.match(AUTO_MARK)?.[1] || null;
}
async function updateAutorole(guild, roleId) {
  const channel = settingsChannel(guild);
  if (!channel || !channel.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.ManageChannels))
    throw new Error('Le bot doit pouvoir gérer un salon textuel pour conserver le réglage.');
  const fresh = await guild.channels.fetch(channel.id);
  const cleaned = (fresh.topic || '').replace(AUTO_MARK, '').trim();
  const topic = [cleaned, roleId ? '[ATLAS_AUTOROLE:' + roleId + ']' : ''].filter(Boolean).join('\n');
  if (topic.length > 1024) throw new Error('Description du salon trop longue.');
  await fresh.setTopic(topic, 'Configuration autorole Atlas Studio');
}
function panel() {
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Créer un ticket')
      .setDescription('Vous avez une question ou besoin d’assistance ? Ouvrez un ticket en expliquant clairement votre demande. Un membre de notre équipe prendra en charge votre requête et vous accompagnera jusqu’à sa résolution.\n\nAfin d’assurer un traitement rapide et efficace, veillez à inclure tous les détails nécessaires dans votre message.')
      .setFooter({ text: 'Atlas Studio • Support' })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('atlas_ticket_open').setLabel('Créer un ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary))]
  };
}
function ticketOwner(channel) {
  return channel?.topic?.match(TICKET_MARK)?.[1] || null;
}
async function handle(interaction) {
  if (interaction.isChatInputCommand() && interaction.commandName === 'autorole') {
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles))
      return interaction.reply({ content: '❌ Permission Gérer les rôles requise.', ephemeral: true });
    const sub = interaction.options.getSubcommand();
    if (sub === 'status') {
      const id = await autoroleId(interaction.guild);
      return interaction.reply({ content: id ? '✅ Rôle automatique : <@&' + id + '>' : 'ℹ️ Aucun rôle automatique défini.', ephemeral: true });
    }
    if (sub === 'disable') {
      await updateAutorole(interaction.guild, null);
      return interaction.reply({ content: '✅ Attribution automatique désactivée.', ephemeral: true });
    }
    const role = interaction.options.getRole('role', true);
    const me = await interaction.guild.members.fetchMe();
    if (role.id === interaction.guild.id || role.managed || role.position >= me.roles.highest.position)
      return interaction.reply({ content: '❌ Le rôle doit être modifiable et placé sous celui du bot.', ephemeral: true });
    await updateAutorole(interaction.guild, role.id);
    return interaction.reply({ content: '✅ Chaque nouveau membre recevra ' + role.toString() + '.', ephemeral: true, allowedMentions: { parse: [] } });
  }
  if (interaction.isChatInputCommand() && interaction.commandName === 'ticket') {
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
      return interaction.reply({ content: '❌ Permission Gérer le serveur requise.', ephemeral: true });
    const channel = await interaction.guild.channels.fetch(PANEL_CHANNEL_ID).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText)
      return interaction.reply({ content: '❌ Salon de panel introuvable sur ce serveur.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    await channel.send(panel());
    return interaction.editReply({ content: '✅ Panel Atlas Studio publié dans <#' + PANEL_CHANNEL_ID + '>.' });
  }
  if (interaction.isButton() && interaction.customId === 'atlas_ticket_open') {
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Utilise ce bouton sur le serveur.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild;
    await guild.channels.fetch();
    const existing = guild.channels.cache.find(c => c.type === ChannelType.GuildText && ticketOwner(c) === interaction.user.id);
    if (existing) return interaction.editReply({ content: '🎫 Tu as déjà un ticket ouvert : ' + existing.toString() });
    const source = await guild.channels.fetch(PANEL_CHANNEL_ID).catch(() => interaction.channel);
    const support = await guild.roles.fetch(SUPPORT_ROLE_ID).catch(() => null);
    const me = await guild.members.fetchMe();
    if (!me.permissions.has(PermissionFlagsBits.ManageChannels))
      return interaction.editReply({ content: '❌ Le bot doit avoir la permission Gérer les salons.' });
    const allow = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks];
    const overwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow },
      { id: me.id, allow: [...allow, PermissionFlagsBits.ManageChannels] }
    ];
    if (support) overwrites.push({ id: support.id, allow });
    const channel = await guild.channels.create({
      name: 'ticket-' + interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0, 24) + '-' + interaction.user.id.slice(-4),
      type: ChannelType.GuildText,
      parent: source?.parentId || null,
      topic: 'ATLAS_TICKET:' + interaction.user.id,
      permissionOverwrites: overwrites,
      reason: 'Ticket Atlas Studio ouvert par ' + interaction.user.username
    });
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('Bienvenue sur le support Atlas Studio')
      .setDescription('Bonjour et bienvenue,\n\nMerci d’avoir contacté le support Atlas Studio.\nDécrivez votre problème puis attendez de recevoir une réponse du support dans les plus brefs délais.')
      .setFooter({ text: 'Atlas Studio • Ticket' }).setTimestamp();
    try {
      await channel.send({
        content: (support ? '<@&' + SUPPORT_ROLE_ID + '> ' : '') + '<@' + interaction.user.id + '>',
        allowedMentions: { roles: support ? [SUPPORT_ROLE_ID] : [], users: [interaction.user.id] },
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('atlas_ticket_close').setLabel('Fermer le ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger))]
      });
    } catch (error) {
      await channel.delete('Échec de création du ticket').catch(() => {});
      throw error;
    }
    return interaction.editReply({ content: '✅ Ton ticket a été créé : ' + channel.toString() });
  }
  if (interaction.isButton() && interaction.customId === 'atlas_ticket_close') {
    const owner = ticketOwner(interaction.channel);
    if (!owner) return interaction.reply({ content: '❌ Ce salon n’est pas un ticket Atlas Studio.', ephemeral: true });
    const staff = interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ||
      interaction.member?.roles?.cache?.has(SUPPORT_ROLE_ID);
    if (interaction.user.id !== owner && !staff)
      return interaction.reply({ content: '❌ Seul le créateur du ticket ou le support peut le fermer.', ephemeral: true });
    await interaction.reply({ content: '🔒 Ticket fermé par <@' + interaction.user.id + '>.', allowedMentions: { users: [interaction.user.id] } });
    await interaction.channel.delete('Ticket fermé par ' + interaction.user.username);
    return true;
  }
  return false;
}
function attach(client) {
  client.on('guildMemberAdd', async member => {
    try {
      const roleId = await autoroleId(member.guild);
      if (!roleId) return;
      const role = await member.guild.roles.fetch(roleId).catch(() => null);
      const me = await member.guild.members.fetchMe();
      if (role && !role.managed && role.position < me.roles.highest.position) {
        await member.roles.add(role, 'Rôle automatique Atlas Studio');
      }
    } catch (error) {
      console.error('[ATLAS AUTOROLE]', error.message);
    }
  });
}
module.exports = { commands, handle, attach };
