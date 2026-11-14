const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

const PANEL_CHANNEL_ID = '1570930108339060898';
const SUPPORT_ROLE_ID = '1570889712179224658';
const TRANSCRIPT_CHANNEL_ID = '1570889758987657306';
const AUTO_MARK = /(?:^|\n)\[ATLAS_AUTOROLE:(\d{17,20})\]/;
const SERVICES = {
  base: { label: 'Service Base FiveM V1', category: '1570979005178445824', emoji: '🎮' },
  bot: { label: 'Service Bot Support Discord', category: '1570979150322475119', emoji: '🤖' },
  video: { label: 'Service Vidéo TikTok', category: '1570979092545802260', emoji: '🎬' },
  graphisme: { label: 'Service Graphisme', category: '1570930108339060898', emoji: '🎨' }
};
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
async function sendTicketTranscript(channel, ownerId, closedBy) {
  const logChannel = await channel.guild.channels.fetch(TRANSCRIPT_CHANNEL_ID);
  if (!logChannel || logChannel.type !== ChannelType.GuildText)
    throw new Error('Salon de transcripts introuvable.');
  const bot = await channel.guild.members.fetchMe();
  const perms = logChannel.permissionsFor(bot);
  if (!perms?.has(PermissionFlagsBits.SendMessages) || !perms.has(PermissionFlagsBits.AttachFiles))
    throw new Error('Permissions Envoyer des messages et Joindre des fichiers requises dans le salon de transcripts.');
  let before;
  const messages = [];
  do {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!batch.size) break;
    messages.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  } while (messages.length < 10000);
  messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const lines = messages.map(m => {
    const date = new Date(m.createdTimestamp).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels' });
    const embeds = m.embeds.map(e => [e.title, e.description, ...(e.fields || []).map(f => f.name + ': ' + f.value)].filter(Boolean).join(' | ')).filter(Boolean);
    const attachments = [...m.attachments.values()].map(a => a.url);
    return '[' + date + '] ' + m.author.username + ' (' + m.author.id + '): ' +
      [m.content, ...embeds, ...attachments].filter(Boolean).join(' | ');
  });
  const transcript = Buffer.from(lines.join('\n') || 'Aucun message.', 'utf8');
  if (transcript.length > 7 * 1024 * 1024)
    throw new Error('Transcript trop volumineux pour être envoyé en une seule pièce jointe.');
  const service = Object.values(SERVICES).find(v => v.category === channel.parentId);
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('📁 Transcript de ticket • Atlas Studio')
    .addFields(
      { name: 'Membre', value: '<@' + ownerId + '>', inline: true },
      { name: 'Fermé par', value: '<@' + closedBy.id + '>', inline: true },
      { name: 'Service', value: service?.label || 'Non identifié', inline: false },
      { name: 'Salon', value: channel.name, inline: true },
      { name: 'Messages', value: String(messages.length), inline: true }
    ).setTimestamp();
  await logChannel.send({
    embeds: [embed],
    files: [{ attachment: transcript, name: 'atlas-transcript-' + channel.id + '.txt' }],
    allowedMentions: { parse: [] }
  });
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
    const channel = interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText)
      return interaction.reply({ content: '❌ Utilise /ticket dans un salon textuel du serveur.', ephemeral: true });
    const botMember = await interaction.guild.members.fetchMe();
    const permissions = channel.permissionsFor(botMember);
    if (!permissions?.has(PermissionFlagsBits.SendMessages) || !permissions?.has(PermissionFlagsBits.EmbedLinks))
      return interaction.reply({ content: '❌ Le bot doit pouvoir envoyer des messages et intégrer des liens dans ce salon.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    await channel.send(panel());
    return interaction.editReply({ content: '✅ Panel Atlas Studio publié dans ' + channel.toString() + '.' });
  }
  if (interaction.isButton() && interaction.customId === 'atlas_ticket_open') {
    return interaction.reply({
      content: 'Sélectionne le service concerné par ta demande :',
      ephemeral: true,
      components: [new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('atlas_ticket_service')
          .setPlaceholder('Choisir un service')
          .addOptions(Object.entries(SERVICES).map(([value, service]) => ({
            label: service.label, value, emoji: service.emoji
          })))
      )]
    });
  }
  if (interaction.isStringSelectMenu() && interaction.customId === 'atlas_ticket_service') {
    const service = SERVICES[interaction.values[0]];
    if (!service) return interaction.reply({ content: '❌ Service invalide.', ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Utilise ce bouton sur le serveur.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild;
    await guild.channels.fetch();
    const existing = guild.channels.cache.find(c => c.type === ChannelType.GuildText && ticketOwner(c) === interaction.user.id);
    if (existing) return interaction.editReply({ content: '🎫 Tu as déjà un ticket ouvert : ' + existing.toString() });
    const category = await guild.channels.fetch(service.category).catch(() => null);
    if (!category || category.type !== ChannelType.GuildCategory)
      return interaction.editReply({ content: '❌ Catégorie de tickets introuvable : `' + service.category + '`. Vérifie les permissions du bot et l’ID.' });
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
      name: interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'membre',
      type: ChannelType.GuildText,
      parent: category.id,
      topic: 'ATLAS_TICKET:' + interaction.user.id,
      permissionOverwrites: overwrites,
      reason: 'Ticket Atlas Studio ouvert par ' + interaction.user.username
    });
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('Bienvenue sur le support Atlas Studio')
      .setDescription('**Service : ' + service.label + '**\n\nBonjour et bienvenue,\n\nMerci d’avoir contacté le support Atlas Studio.\nDécrivez votre problème puis attendez de recevoir une réponse du support dans les plus brefs délais.')
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
    await interaction.deferReply({ ephemeral: true });
    try {
      await sendTicketTranscript(interaction.channel, owner, interaction.user);
    } catch (error) {
      console.error('[ATLAS TRANSCRIPT]', error);
      return interaction.editReply({ content: '❌ Impossible de sauvegarder le transcript : ' + error.message + ' Le ticket reste ouvert.' });
    }
    await interaction.editReply({ content: '✅ Transcript enregistré. Fermeture du ticket…' });
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
