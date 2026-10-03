const http = require('http');
const {
  Client,
  Events,
  GatewayIntentBits,
  ActivityType,
  EmbedBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits,
  Partials,
  ChannelType,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder
} = require('discord.js');

const PORT = process.env.PORT || 3000;
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel],
  presence: {
    activities: [{ name: '/help • PlayWise', type: ActivityType.Playing }],
    status: 'online'
  }
});

const server = http.createServer((req, res) => {
  const ready = client.isReady();
  const healthCheck = req.url?.split('?')[0] === '/healthz';
  res.writeHead(healthCheck && !ready ? 503 : 200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify({
    ok: healthCheck ? ready : true,
    version: 'discord-recovery-v1',
    discord: client.isReady() ? 'online' : 'offline',
    guilds: client.isReady() ? client.guilds.cache.size : 0
  }));
});
server.listen(PORT, '0.0.0.0', () => console.log('[WEB] Port', PORT));
server.on('error', error => {
  console.error('[WEB]', error.message);
  shutdown(1);
});


const TICKET_CATEGORY_NAME = '📩・tickets-mp';
const TICKET_LOG_CHANNEL_NAME = '📜・ticket-logs';

const TICKET_SUBJECTS = {
  assistance: { label: 'Assistance générale', emoji: '🆘' },
  site: { label: 'Problème avec le site', emoji: '🌐' },
  discord: { label: 'Problème Discord', emoji: '💬' },
  bot: { label: 'Problème avec le bot', emoji: '🤖' },
  partenariat: { label: 'Partenariat', emoji: '🤝' },
  signalement: { label: 'Signalement', emoji: '🚨' },
  suggestion: { label: 'Suggestion', emoji: '💡' },
  autre: { label: 'Autre question / problème', emoji: '❓' }
};

function ticketSubjectLabel(value) {
  const item = TICKET_SUBJECTS[value];
  return item ? item.emoji + ' ' + item.label : '❓ Non précisé';
}

function ticketTopic(userId, subject = 'autre', claimedBy = '') {
  return 'DM_TICKET:' + userId + '|SUBJECT:' + subject + (claimedBy ? '|CLAIM:' + claimedBy : '');
}

function parseTicketTopic(topic = '') {
  if (!topic.startsWith('DM_TICKET:')) return null;
  const parts = topic.split('|');
  const userId = parts[0].slice('DM_TICKET:'.length);
  const subject = (parts.find(p => p.startsWith('SUBJECT:')) || 'SUBJECT:autre').slice('SUBJECT:'.length);
  const claimedBy = (parts.find(p => p.startsWith('CLAIM:')) || 'CLAIM:').slice('CLAIM:'.length) || null;
  return { userId, subject, claimedBy };
}

async function getMainGuild() {
  const configured = process.env.DISCORD_GUILD_ID;
  if (configured) {
    const guild = client.guilds.cache.get(configured) || await client.guilds.fetch(configured).catch(() => null);
    if (guild) return guild;
  }
  return client.guilds.cache.first() || null;
}

function getStaffRole(guild) {
  const configured = process.env.TICKET_STAFF_ROLE_ID;
  if (configured && guild.roles.cache.has(configured)) return guild.roles.cache.get(configured);
  return guild.roles.cache
    .filter(r => r.id !== guild.roles.everyone.id)
    .sort((a, b) => b.position - a.position)
    .find(r => /staff|support|mod[eé]rateur|admin/i.test(r.name)) || null;
}

async function getOrCreateTicketCategory(guild) {
  let category = guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name === TICKET_CATEGORY_NAME
  );

  if (!category) {
    const staffRole = getStaffRole(guild);
    const overwrites = [{
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    }];

    if (staffRole) {
      overwrites.push({
        id: staffRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles
        ]
      });
    }

    category = await guild.channels.create({
      name: TICKET_CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      permissionOverwrites: overwrites
    });
  }

  return category;
}

async function getOrCreateTicketLogChannel(guild) {
  const category = await getOrCreateTicketCategory(guild);
  let channel = guild.channels.cache.find(
    c => c.type === ChannelType.GuildText && c.name === TICKET_LOG_CHANNEL_NAME && c.parentId === category.id
  );

  if (!channel) {
    channel = await guild.channels.create({
      name: TICKET_LOG_CHANNEL_NAME,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: 'Logs des tickets MP PlayWise'
    });
  }

  return channel;
}

async function findTicketChannel(guild, userId) {
  return guild.channels.cache.find(
    c => c.type === ChannelType.GuildText && c.topic?.startsWith('DM_TICKET:' + userId + '|')
  ) || null;
}

function safeChannelName(username, userId) {
  const slug = username.toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20) || 'membre';
  return ('ticket-' + slug + '-' + userId.slice(-4)).slice(0, 90);
}

function buildTicketActions(claimedBy = null) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('claim_dm_ticket')
      .setLabel(claimedBy ? 'Pris en charge' : 'Prendre en charge')
      .setEmoji(claimedBy ? '✅' : '🙋')
      .setStyle(claimedBy ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(Boolean(claimedBy)),
    new ButtonBuilder()
      .setCustomId('ticket_user_info')
      .setLabel('Infos membre')
      .setEmoji('👤')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('close_dm_ticket')
      .setLabel('Fermer')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
  );
}

function buildTicketStaffEmbed(user, subject = 'autre', claimedBy = null) {
  return new EmbedBuilder()
    .setColor(claimedBy ? 0x57F287 : 0xFEE75C)
    .setAuthor({ name: 'PlayWise • Support privé', iconURL: client.user.displayAvatarURL() })
    .setTitle('🎫 Ticket de ' + user.username)
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .setDescription(
      'Un membre vient de contacter le support en message privé.\n\n' +
      '**Répondez directement dans ce salon** : chaque message sera transmis en MP au membre.'
    )
    .addFields(
      { name: '👤 Membre', value: '<@' + user.id + '>', inline: true },
      { name: '🆔 ID', value: '\\`' + user.id + '\\`', inline: true },
      { name: '📂 Sujet', value: ticketSubjectLabel(subject), inline: false },
      { name: '📌 Statut', value: claimedBy ? '🟢 Pris en charge' : '🟠 En attente d’un membre du staff', inline: true },
      { name: '🛡️ Responsable', value: claimedBy ? '<@' + claimedBy + '>' : 'Aucun', inline: true }
    )
    .setFooter({ text: 'PlayWise • Ticket MP' })
    .setTimestamp();
}

async function getOrCreateTicketChannel(guild, user, subject = 'autre') {
  let channel = await findTicketChannel(guild, user.id);
  if (channel) return channel;

  const category = await getOrCreateTicketCategory(guild);
  const staffRole = getStaffRole(guild);

  const overwrites = [{
    id: guild.roles.everyone.id,
    deny: [PermissionFlagsBits.ViewChannel]
  }];

  if (staffRole) {
    overwrites.push({
      id: staffRole.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles
      ]
    });
  }

  channel = await guild.channels.create({
    name: safeChannelName(user.username, user.id),
    type: ChannelType.GuildText,
    parent: category.id,
    topic: ticketTopic(user.id, subject),
    permissionOverwrites: overwrites
  });

  await channel.send({
    embeds: [buildTicketStaffEmbed(user, subject)],
    components: [buildTicketActions()]
  });

  return channel;
}

async function relayDmToTicket(message) {
  const guild = await getMainGuild();
  if (!guild) {
    return message.reply("❌ Aucun serveur n'est configuré pour recevoir les tickets.");
  }

  const existing = await findTicketChannel(guild, message.author.id);
  const channel = await getOrCreateTicketChannel(guild, message.author, 'autre');

  if (!existing) {
    await message.author.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setAuthor({ name: 'PlayWise • Support', iconURL: client.user.displayAvatarURL() })
          .setTitle('🎫 Ticket ouvert')
          .setDescription(
            'Bonjour **' + message.author.username + '** 👋\n\n' +
            'Ton ticket vient d’être créé. Tu peux continuer à écrire **ici en MP**.\n' +
            'Tes messages sont transmis directement à notre équipe support.\n\n' +
            '🟠 **Statut :** En attente d’un membre du staff'
          )
          .setFooter({ text: 'PlayWise • Un seul ticket ouvert par personne' })
          .setTimestamp()
      ]
    }).catch(() => {});
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setAuthor({
      name: message.author.username + ' • Membre',
      iconURL: message.author.displayAvatarURL()
    })
    .setDescription(message.content || '*Pièce jointe envoyée*')
    .setFooter({ text: 'Message reçu en MP' })
    .setTimestamp();

  const files = [...message.attachments.values()].map(a => a.url);
  await channel.send({ embeds: [embed], files });
  await message.react('✅').catch(() => {});
}

async function relayStaffToUser(message, userId) {
  if (message.author.bot) return;
  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) return;

  const member = message.member || await message.guild?.members.fetch(message.author.id).catch(() => null);
  const highestRole = member?.roles?.highest && member.roles.highest.id !== message.guild?.roles.everyone.id
    ? member.roles.highest.name
    : 'Staff';

  const staffName = member?.displayName || message.author.username;

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setAuthor({
      name: staffName + ' • ' + highestRole,
      iconURL: message.author.displayAvatarURL()
    })
    .setDescription(message.content || '*Pièce jointe envoyée*')
    .setFooter({ text: 'PlayWise • Support MP' })
    .setTimestamp();

  const files = [...message.attachments.values()].map(a => a.url);
  await user.send({ embeds: [embed], files }).catch(async () => {
    await message.reply("❌ Impossible d'envoyer un MP à cet utilisateur.").catch(() => {});
  });
}

async function buildTranscript(channel) {
  const fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!fetched) return Buffer.from('Transcript indisponible.', 'utf8');

  const lines = fetched.sort((a, b) => a.createdTimestamp - b.createdTimestamp).map(msg => {
    const date = new Date(msg.createdTimestamp).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels' });
    const text = msg.content || '';
    const embedText = msg.embeds.map(e => [e.title, e.description].filter(Boolean).join(' — ')).filter(Boolean).join(' | ');
    const attachments = [...msg.attachments.values()].map(a => a.url).join(' ');
    return '[' + date + '] ' + (msg.author?.tag || msg.author?.username || 'Inconnu') + ': ' +
      [text, embedText, attachments].filter(Boolean).join(' ');
  });

  return Buffer.from(lines.join('\n') || 'Aucun message.', 'utf8');
}

async function logClosedTicket(channel, data, closer, reason) {
  const logChannel = await getOrCreateTicketLogChannel(channel.guild).catch(() => null);
  if (!logChannel) return;

  const transcript = await buildTranscript(channel);
  const user = await client.users.fetch(data.userId).catch(() => null);

  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('📁 Ticket fermé')
    .addFields(
      { name: '👤 Membre', value: user ? user.username + ' (\\`' + data.userId + '\\`)' : '\\`' + data.userId + '\\`', inline: false },
      { name: '📂 Sujet', value: ticketSubjectLabel(data.subject), inline: true },
      { name: '🛡️ Pris en charge par', value: data.claimedBy ? '<@' + data.claimedBy + '>' : 'Personne', inline: true },
      { name: '🔒 Fermé par', value: '<@' + closer.id + '>', inline: true },
      { name: '📝 Raison', value: reason.slice(0, 1024), inline: false }
    )
    .setFooter({ text: 'PlayWise • Historique ticket' })
    .setTimestamp();

  await logChannel.send({
    embeds: [embed],
    files: [{ attachment: transcript, name: 'transcript-' + data.userId + '.txt' }]
  }).catch(() => {});
}

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Affiche la latence du bot'),
  new SlashCommandBuilder().setName('help').setDescription('Affiche les commandes'),
  new SlashCommandBuilder().setName('serverinfo').setDescription('Informations sur le serveur'),
  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Informations sur un membre')
    .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(false)),
  new SlashCommandBuilder()
    .setName('avatar')
    .setDescription("Affiche l'avatar d'un membre")
    .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(false)),
  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Fait envoyer un message par le bot')
    .addStringOption(o => o.setName('message').setDescription('Message').setRequired(true)),
  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Envoie un embed')
    .addStringOption(o => o.setName('titre').setDescription('Titre').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Message').setRequired(true)),
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Supprime des messages')
    .addIntegerOption(o => o.setName('nombre').setDescription('1 à 100').setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Crée un sondage oui/non')
    .addStringOption(o => o.setName('question').setDescription('Question').setRequired(true)),
  new SlashCommandBuilder().setName('status').setDescription('Affiche le statut du bot'),
  new SlashCommandBuilder().setName('close').setDescription('Ferme un ticket MP'),
  new SlashCommandBuilder().setName('ticketpanel').setDescription('Envoie le panneau de création de ticket'),
  new SlashCommandBuilder()
    .setName('kick').setDescription('Expulse un membre')
    .addUserOption(o => o.setName('membre').setDescription('Membre à expulser').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(false)),
  new SlashCommandBuilder()
    .setName('ban').setDescription('Bannit un membre')
    .addUserOption(o => o.setName('membre').setDescription('Membre à bannir').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(false)),
  new SlashCommandBuilder()
    .setName('timeout').setDescription('Met un membre en timeout')
    .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true))
    .addIntegerOption(o => o.setName('minutes').setDescription('Durée en minutes').setMinValue(1).setMaxValue(10080).setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(false)),
  new SlashCommandBuilder()
    .setName('untimeout').setDescription('Retire le timeout d’un membre')
    .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder()
    .setName('slowmode').setDescription('Modifie le mode lent du salon')
    .addIntegerOption(o => o.setName('secondes').setDescription('0 à 21600 secondes').setMinValue(0).setMaxValue(21600).setRequired(true)),
  new SlashCommandBuilder().setName('lock').setDescription('Verrouille le salon actuel'),
  new SlashCommandBuilder().setName('unlock').setDescription('Déverrouille le salon actuel'),
  new SlashCommandBuilder()
    .setName('nick').setDescription('Change le surnom d’un membre')
    .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true))
    .addStringOption(o => o.setName('surnom').setDescription('Nouveau surnom').setRequired(true).setMaxLength(32)),
  new SlashCommandBuilder()
    .setName('role').setDescription('Ajoute ou retire un rôle')
    .addStringOption(o => o.setName('action').setDescription('Action').setRequired(true).addChoices(
      { name: 'Ajouter', value: 'add' },
      { name: 'Retirer', value: 'remove' }
    ))
    .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Rôle').setRequired(true)),
  new SlashCommandBuilder()
    .setName('announce').setDescription('Envoie une annonce')
    .addStringOption(o => o.setName('titre').setDescription('Titre').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Message').setRequired(true)),
  new SlashCommandBuilder().setName('membercount').setDescription('Affiche le nombre de membres'),
  new SlashCommandBuilder().setName('ticketinfo').setDescription('Affiche les infos du ticket actuel')
].map(c => c.toJSON());

client.once(Events.ClientReady, async () => {
  console.log('[DISCORD] Connecté en tant que', client.user.tag);
  for (const guild of client.guilds.cache.values()) {
    try { await guild.members.me?.setNickname('PlayWise'); } catch {}
  }
  client.user.setPresence({
    activities: [{ name: '/help • PlayWise', type: ActivityType.Playing }],
    status: 'online'
  });

  for (const guild of client.guilds.cache.values()) {
    try {
      await guild.commands.set(commands);
      console.log('[COMMANDS] Enregistrées sur', guild.name);
    } catch (e) {
      console.error('[COMMANDS]', e.message);
    }
  }
});

client.on('guildCreate', async guild => {
  try { await guild.commands.set(commands); } catch (e) { console.error(e.message); }
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isButton() && interaction.customId === 'claim_dm_ticket') {
      const data = parseTicketTopic(interaction.channel?.topic || '');
      if (!data) {
        return interaction.reply({ content: '❌ Ce bouton fonctionne uniquement dans un ticket.', ephemeral: true });
      }
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ content: '❌ Permission Gérer les messages requise.', ephemeral: true });
      }
      if (data.claimedBy) {
        return interaction.reply({ content: '❌ Ce ticket est déjà pris en charge par <@' + data.claimedBy + '>.' , ephemeral: true });
      }

      const user = await client.users.fetch(data.userId).catch(() => null);
      await interaction.channel.setTopic(ticketTopic(data.userId, data.subject, interaction.user.id)).catch(() => {});

      if (user) {
        await interaction.update({
          embeds: [buildTicketStaffEmbed(user, data.subject, interaction.user.id)],
          components: [buildTicketActions(interaction.user.id)]
        });
      } else {
        await interaction.reply({ content: '✅ Ticket pris en charge.', ephemeral: true });
      }

      await interaction.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57F287)
            .setDescription('✅ <@' + interaction.user.id + '> a pris en charge ce ticket.')
            .setTimestamp()
        ]
      });

      if (user) {
        await user.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('✅ Ton ticket est pris en charge')
              .setDescription(
                '**' + interaction.user.username + '** s’occupe maintenant de ta demande.\n\n' +
                'Tu peux continuer à écrire directement ici.'
              )
              .setFooter({ text: 'PlayWise • Support MP' })
              .setTimestamp()
          ]
        }).catch(() => {});
      }
      return;
    }

    if (interaction.isButton() && interaction.customId === 'ticket_user_info') {
      const data = parseTicketTopic(interaction.channel?.topic || '');
      if (!data) {
        return interaction.reply({ content: '❌ Ce bouton fonctionne uniquement dans un ticket.', ephemeral: true });
      }

      const user = await client.users.fetch(data.userId).catch(() => null);
      if (!user) return interaction.reply({ content: '❌ Utilisateur introuvable.', ephemeral: true });

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('👤 Informations du membre')
            .setThumbnail(user.displayAvatarURL({ size: 256 }))
            .addFields(
              { name: 'Pseudo', value: user.tag || user.username, inline: true },
              { name: 'ID', value: '\\`' + user.id + '\\`', inline: true },
              { name: 'Sujet', value: ticketSubjectLabel(data.subject), inline: false },
              { name: 'Compte créé', value: '<t:' + Math.floor(user.createdTimestamp / 1000) + ':F>', inline: false }
            )
        ],
        ephemeral: true
      });
    }

    if (interaction.isButton() && interaction.customId === 'close_dm_ticket') {
      const data = parseTicketTopic(interaction.channel?.topic || '');
      if (!data) {
        return interaction.reply({ content: '❌ Ce bouton fonctionne uniquement dans un ticket.', ephemeral: true });
      }
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({ content: '❌ Permission Gérer les salons requise.', ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId('close_dm_ticket_modal')
        .setTitle('Fermer le ticket');

      const reason = new TextInputBuilder()
        .setCustomId('close_reason')
        .setLabel('Raison de la fermeture')
        .setPlaceholder('Ex. Demande résolue')
        .setRequired(true)
        .setMaxLength(300)
        .setStyle(TextInputStyle.Paragraph);

      modal.addComponents(new ActionRowBuilder().addComponents(reason));
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'close_dm_ticket_modal') {
      const data = parseTicketTopic(interaction.channel?.topic || '');
      if (!data) {
        return interaction.reply({ content: '❌ Ce formulaire ne correspond pas à un ticket.', ephemeral: true });
      }

      const reason = interaction.fields.getTextInputValue('close_reason') || 'Aucune raison précisée';
      const user = await client.users.fetch(data.userId).catch(() => null);

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('🔒 Fermeture du ticket')
            .setDescription(
              'Ticket fermé par <@' + interaction.user.id + '>.\n\n' +
              '**Raison :** ' + reason + '\n\n' +
              'Le transcript est en cours d’archivage.'
            )
            .setTimestamp()
        ]
      });

      if (user) {
        await user.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('🔒 Ton ticket est fermé')
              .setDescription(
                'Ton ticket PlayWise vient d’être fermé par **' + interaction.user.username + '**.\n\n' +
                '**Raison :** ' + reason + '\n\n' +
                'Si tu as encore besoin d’aide, tu pourras ouvrir un nouveau ticket depuis le panneau support.'
              )
              .setFooter({ text: 'PlayWise • Support MP' })
              .setTimestamp()
          ]
        }).catch(() => {});
      }

      await logClosedTicket(interaction.channel, data, interaction.user, reason);
      setTimeout(() => interaction.channel.delete('Ticket Support MP fermé').catch(() => {}), 3500);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_subject_menu') {
      const subject = interaction.values[0];
      const subjectText = ticketSubjectLabel(subject);
      const guild = interaction.guild;

      if (!guild) {
        return interaction.reply({ content: '❌ Ce menu doit être utilisé depuis un serveur.', ephemeral: true });
      }

      const alreadyOpen = await findTicketChannel(guild, interaction.user.id);
      if (alreadyOpen) {
        const existingData = parseTicketTopic(alreadyOpen.topic || '');
        await interaction.user.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xFEE75C)
              .setTitle('🎫 Tu as déjà un ticket ouvert')
              .setDescription(
                'Ton ticket est toujours actif. Continue simplement la conversation ici en MP.\n\n' +
                '**Sujet :** ' + ticketSubjectLabel(existingData?.subject || 'autre')
              )
              .setFooter({ text: 'PlayWise • Support MP' })
          ]
        }).catch(() => {});

        return interaction.reply({
          content: '⚠️ Tu as déjà un ticket ouvert. Continue directement dans tes MP avec le bot.',
          ephemeral: true
        });
      }

      const channel = await getOrCreateTicketChannel(guild, interaction.user, subject);

      let dmOk = true;
      await interaction.user.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865F2)
            .setAuthor({ name: 'PlayWise • Support', iconURL: client.user.displayAvatarURL() })
            .setTitle('🎫 Ticket créé avec succès')
            .setDescription(
              'Bonjour **' + interaction.user.username + '** 👋\n\n' +
              'Ta demande a bien été prise en compte.\n\n' +
              '**Sujet :** ' + subjectText + '\n' +
              '🟠 **Statut :** En attente d’un membre du staff\n\n' +
              'Explique maintenant ta demande **directement ici en MP**. Tu peux envoyer du texte, des captures ou des fichiers.'
            )
            .setFooter({ text: 'PlayWise • Support privé' })
            .setTimestamp()
        ]
      }).catch(() => { dmOk = false; });

      if (!dmOk) {
        await channel.delete('MP fermés lors de la création').catch(() => {});
        return interaction.reply({
          content: '⚠️ Je ne peux pas t’envoyer de MP. Active les messages privés du serveur puis réessaie.',
          ephemeral: true
        });
      }

      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865F2)
            .setDescription('📨 Ticket ouvert depuis le panneau support. Sujet : **' + subjectText + '**')
            .setTimestamp()
        ]
      });

      return interaction.reply({
        content: '✅ Ticket créé ! Je viens de t’envoyer un **MP**. Continue la discussion là-bas.',
        ephemeral: true
      });
    }

    if (interaction.isButton() && interaction.customId === 'open_dm_ticket') {
      const guild = interaction.guild;
      if (!guild) {
        return interaction.reply({ content: '❌ Ce bouton doit être utilisé depuis un serveur.', ephemeral: true });
      }

      const alreadyOpen = await findTicketChannel(guild, interaction.user.id);
      if (alreadyOpen) {
        return interaction.reply({ content: '⚠️ Tu as déjà un ticket ouvert. Continue dans tes MP.', ephemeral: true });
      }

      const channel = await getOrCreateTicketChannel(guild, interaction.user, 'autre');
      let dmOk = true;

      await interaction.user.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🎫 Ticket créé')
            .setDescription(
              'Ton ticket est ouvert. Décris ta demande directement ici en MP.\n\n' +
              '🟠 **Statut :** En attente d’un membre du staff'
            )
            .setFooter({ text: 'PlayWise • Support MP' })
            .setTimestamp()
        ]
      }).catch(() => { dmOk = false; });

      if (!dmOk) {
        await channel.delete('MP fermés lors de la création').catch(() => {});
        return interaction.reply({
          content: '⚠️ Active tes messages privés puis réessaie.',
          ephemeral: true
        });
      }

      return interaction.reply({
        content: '✅ Ticket créé ! Regarde tes MP avec le bot.',
        ephemeral: true
      });
    }

    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'ping') {
      return interaction.reply('🏓 Pong ! **' + client.ws.ping + ' ms**');
    }

    if (interaction.commandName === 'help') {
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🤖 PlayWise — Commandes')
        .setDescription([
          '/ping — latence',
          '/serverinfo — infos serveur',
          '/userinfo — infos membre',
          '/avatar — avatar',
          '/poll — sondage',
          '/status — état du bot',
          '/say — message du bot (staff)',
          '/embed — embed (staff)',
          '/clear — supprimer des messages (staff)',
          '/close — fermer un ticket MP (staff)',
          '/ticketpanel — envoyer le panneau de tickets (staff)',
          '/ticketinfo — infos du ticket actuel',
          '/kick • /ban — modération',
          '/timeout • /untimeout — timeout',
          '/slowmode — mode lent',
          '/lock • /unlock — verrouiller un salon',
          '/nick — changer un surnom',
          '/role — ajouter/retirer un rôle',
          '/announce — annonce en embed',
          '/membercount — nombre de membres',
          '',
          '📩 **Tickets par MP**',
          'Un membre envoie un MP au bot → un salon privé est créé.',
          'Le staff répond dans le salon → le membre reçoit la réponse en MP.'
        ].join('\n'))
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.commandName === 'serverinfo') {
      const g = interaction.guild;
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊 ' + g.name)
        .setThumbnail(g.iconURL({ size: 256 }))
        .addFields(
          { name: 'Membres', value: String(g.memberCount), inline: true },
          { name: 'ID', value: g.id, inline: true },
          { name: 'Créé', value: '<t:' + Math.floor(g.createdTimestamp / 1000) + ':D>', inline: true }
        );
      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'userinfo') {
      const user = interaction.options.getUser('membre') || interaction.user;
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('👤 ' + user.username)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: 'ID', value: user.id, inline: true },
          { name: 'Compte créé', value: '<t:' + Math.floor(user.createdTimestamp / 1000) + ':D>', inline: true }
        );
      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'avatar') {
      const user = interaction.options.getUser('membre') || interaction.user;
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Avatar de ' + user.username)
        .setImage(user.displayAvatarURL({ size: 1024 }));
      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'say') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ content: '❌ Permission Gérer les messages requise.', ephemeral: true });
      }
      const message = interaction.options.getString('message', true);
      await interaction.reply({ content: '✅ Envoyé.', ephemeral: true });
      return interaction.channel.send(message);
    }

    if (interaction.commandName === 'embed') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ content: '❌ Permission Gérer les messages requise.', ephemeral: true });
      }
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(interaction.options.getString('titre', true))
        .setDescription(interaction.options.getString('message', true))
        .setFooter({ text: 'Envoyé par ' + interaction.user.username })
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'clear') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ content: '❌ Permission Gérer les messages requise.', ephemeral: true });
      }
      const amount = interaction.options.getInteger('nombre', true);
      const deleted = await interaction.channel.bulkDelete(amount, true);
      return interaction.reply({ content: '🧹 ' + deleted.size + ' message(s) supprimé(s).', ephemeral: true });
    }

    if (interaction.commandName === 'poll') {
      const question = interaction.options.getString('question', true);
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊 Sondage')
        .setDescription(question)
        .setFooter({ text: 'Créé par ' + interaction.user.username })
        .setTimestamp();
      const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
      await msg.react('✅');
      await msg.react('❌');
      return;
    }

    if (interaction.commandName === 'status') {
      return interaction.reply({
        content: '🟢 PlayWise est en ligne\nServeurs : **' + client.guilds.cache.size + '**\nPing : **' + client.ws.ping + ' ms**',
        ephemeral: true
      });
    }


    if (interaction.commandName === 'kick') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.KickMembers)) {
        return interaction.reply({ content: '❌ Permission Expulser des membres requise.', ephemeral: true });
      }
      const user = interaction.options.getUser('membre', true);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const reason = interaction.options.getString('raison') || 'Aucune raison';
      if (!member || !member.kickable) return interaction.reply({ content: '❌ Je ne peux pas expulser ce membre.', ephemeral: true });
      await member.kick(reason);
      return interaction.reply('👢 **' + user.tag + '** a été expulsé. Raison : **' + reason + '**');
    }

    if (interaction.commandName === 'ban') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.BanMembers)) {
        return interaction.reply({ content: '❌ Permission Bannir des membres requise.', ephemeral: true });
      }
      const user = interaction.options.getUser('membre', true);
      const reason = interaction.options.getString('raison') || 'Aucune raison';
      await interaction.guild.members.ban(user.id, { reason });
      return interaction.reply('🔨 **' + user.tag + '** a été banni. Raison : **' + reason + '**');
    }

    if (interaction.commandName === 'timeout') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)) {
        return interaction.reply({ content: '❌ Permission Modérer les membres requise.', ephemeral: true });
      }
      const user = interaction.options.getUser('membre', true);
      const minutes = interaction.options.getInteger('minutes', true);
      const reason = interaction.options.getString('raison') || 'Aucune raison';
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member || !member.moderatable) return interaction.reply({ content: '❌ Je ne peux pas mettre ce membre en timeout.', ephemeral: true });
      await member.timeout(minutes * 60000, reason);
      return interaction.reply('⏳ **' + user.tag + '** est en timeout pendant **' + minutes + ' min**.');
    }

    if (interaction.commandName === 'untimeout') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)) {
        return interaction.reply({ content: '❌ Permission Modérer les membres requise.', ephemeral: true });
      }
      const user = interaction.options.getUser('membre', true);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member || !member.moderatable) return interaction.reply({ content: '❌ Je ne peux pas modifier ce membre.', ephemeral: true });
      await member.timeout(null);
      return interaction.reply('✅ Timeout retiré pour **' + user.tag + '**.');
    }

    if (interaction.commandName === 'slowmode') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({ content: '❌ Permission Gérer les salons requise.', ephemeral: true });
      }
      const seconds = interaction.options.getInteger('secondes', true);
      if (!interaction.channel.setRateLimitPerUser) return interaction.reply({ content: '❌ Non disponible dans ce salon.', ephemeral: true });
      await interaction.channel.setRateLimitPerUser(seconds);
      return interaction.reply('⏱️ Mode lent réglé sur **' + seconds + ' seconde(s)**.');
    }

    if (interaction.commandName === 'lock' || interaction.commandName === 'unlock') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({ content: '❌ Permission Gérer les salons requise.', ephemeral: true });
      }
      const locked = interaction.commandName === 'lock';
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: locked ? false : null
      });
      return interaction.reply(locked ? '🔒 Salon verrouillé.' : '🔓 Salon déverrouillé.');
    }

    if (interaction.commandName === 'nick') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageNicknames)) {
        return interaction.reply({ content: '❌ Permission Gérer les pseudos requise.', ephemeral: true });
      }
      const user = interaction.options.getUser('membre', true);
      const nickname = interaction.options.getString('surnom', true);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member || !member.manageable) return interaction.reply({ content: '❌ Je ne peux pas modifier ce membre.', ephemeral: true });
      await member.setNickname(nickname);
      return interaction.reply('✏️ Surnom de **' + user.tag + '** changé en **' + nickname + '**.');
    }

    if (interaction.commandName === 'role') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.reply({ content: '❌ Permission Gérer les rôles requise.', ephemeral: true });
      }
      const action = interaction.options.getString('action', true);
      const user = interaction.options.getUser('membre', true);
      const role = interaction.options.getRole('role', true);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: '❌ Membre introuvable.', ephemeral: true });
      if (role.position >= interaction.guild.members.me.roles.highest.position) {
        return interaction.reply({ content: '❌ Ce rôle est au-dessus ou au même niveau que mon rôle.', ephemeral: true });
      }
      if (action === 'add') await member.roles.add(role);
      else await member.roles.remove(role);
      return interaction.reply((action === 'add' ? '✅ Rôle ajouté à ' : '✅ Rôle retiré de ') + '**' + user.tag + '** : ' + role.toString());
    }

    if (interaction.commandName === 'announce') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ content: '❌ Permission Gérer les messages requise.', ephemeral: true });
      }
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📢 ' + interaction.options.getString('titre', true))
        .setDescription(interaction.options.getString('message', true))
        .setFooter({ text: 'PlayWise • Annonce' })
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'membercount') {
      return interaction.reply('👥 **' + interaction.guild.memberCount + '** membres sur **' + interaction.guild.name + '**.');
    }

    if (interaction.commandName === 'ticketinfo') {
      const topic = interaction.channel?.topic || '';
      if (!topic.startsWith('DM_TICKET:')) {
        return interaction.reply({ content: '❌ Ce salon n’est pas un ticket MP.', ephemeral: true });
      }
      const userId = topic.slice('DM_TICKET:'.length);
      const user = await client.users.fetch(userId).catch(() => null);
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🎫 Informations du ticket')
        .addFields(
          { name: 'Utilisateur', value: user ? '<@' + user.id + '>' : userId, inline: true },
          { name: 'ID', value: userId, inline: true },
          { name: 'Salon', value: interaction.channel.toString(), inline: true }
        )
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.commandName === 'ticketpanel') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: '❌ Permission Gérer le serveur requise.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({ name: 'PlayWise • Centre de support', iconURL: client.user.displayAvatarURL() })
        .setTitle('PlayWise - Support')
        .setDescription(
          'Bonjour, pour créer un ticket et contacter notre équipe, choisissez le **sujet de votre demande** ci-dessous.\n\n' +
          'Une fois le sujet sélectionné, PlayWise vous contactera directement en **message privé** pour poursuivre votre demande.\n\n' +
          '**Propulsé par l’équipe PlayWise** 🔥'
        )
        .setFooter({ text: 'PlayWise • Support MP' })
        .setTimestamp();

      const menu = new StringSelectMenuBuilder()
        .setCustomId('ticket_subject_menu')
        .setPlaceholder('Choisir le sujet')
        .addOptions(
          { label: 'Assistance générale', value: 'assistance', emoji: '🆘', description: 'Besoin d’aide ou d’informations' },
          { label: 'Problème avec le site', value: 'site', emoji: '🌐', description: 'Bug ou problème sur PlayWise' },
          { label: 'Problème Discord', value: 'discord', emoji: '💬', description: 'Serveur, rôle ou accès Discord' },
          { label: 'Problème avec le bot', value: 'bot', emoji: '🤖', description: 'Commande ou fonctionnalité du bot' },
          { label: 'Partenariat', value: 'partenariat', emoji: '🤝', description: 'Demande de partenariat' },
          { label: 'Signalement', value: 'signalement', emoji: '🚨', description: 'Signaler un problème ou un membre' },
          { label: 'Suggestion', value: 'suggestion', emoji: '💡', description: 'Proposer une idée à PlayWise' },
          { label: 'Autre question / problème', value: 'autre', emoji: '❓', description: 'Toute autre demande' }
        );

      const row = new ActionRowBuilder().addComponents(menu);

      await interaction.channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: '✅ Panneau de tickets envoyé.', ephemeral: true });
    }

    if (interaction.commandName === 'close') {
      const topic = interaction.channel?.topic || '';
      if (!topic.startsWith('DM_TICKET:')) {
        return interaction.reply({ content: '❌ Cette commande doit être utilisée dans un ticket MP.', ephemeral: true });
      }
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({ content: '❌ Permission Gérer les salons requise.', ephemeral: true });
      }
      const userId = topic.slice('DM_TICKET:'.length);
      const user = await client.users.fetch(userId).catch(() => null);
      if (user) {
        await user.send('✅ Ton ticket PlayWise a été fermé par le staff. Tu peux renvoyer un MP au bot pour en ouvrir un nouveau.').catch(() => {});
      }
      await interaction.reply('🔒 Ticket fermé. Suppression du salon dans 3 secondes…');
      setTimeout(() => interaction.channel.delete('Ticket MP fermé').catch(() => {}), 3000);
    }
  } catch (e) {
    console.error('[COMMAND ERROR]', e);
    if (interaction.replied) {
      return interaction.followUp({ content: '❌ Une erreur est survenue.', ephemeral: true }).catch(() => {});
    }
    return interaction.reply({ content: '❌ Une erreur est survenue.', ephemeral: true }).catch(() => {});
  }
});


client.on('messageCreate', async message => {
  try {
    if (message.author.bot) return;

    console.log('[MESSAGE]', message.channel.type === ChannelType.DM ? 'DM' : 'GUILD', message.author.tag || message.author.username);

    if (message.channel.type === ChannelType.DM) {
      await relayDmToTicket(message);
      return;
    }

    if (message.channel.type === ChannelType.GuildText && message.channel.topic?.startsWith('DM_TICKET:')) {
      const data = parseTicketTopic(message.channel.topic);
      if (!data?.userId) return;
      await relayStaffToUser(message, data.userId);
    }
  } catch (e) {
    console.error('[TICKET MP]', e);
  }
});

// discord.js handles normal gateway reconnections. Only restart if recovery stalls.
let stopping = false;
let retryTimer;
let loginInProgress = false;
let attempts = 0;
let offlineSince = Date.now();

function shutdown(code) {
  if (stopping) return;
  stopping = true;
  clearTimeout(retryTimer);
  clearInterval(connectionWatchdog);
  clearInterval(keepAliveTimer);
  const deadline = setTimeout(() => process.exit(code), 5000);
  deadline.unref();
  Promise.resolve(client.destroy()).catch(() => {}).finally(() => {
    server.close(() => process.exit(code));
  });
}

client.on(Events.ClientReady, () => {
  offlineSince = null;
  attempts = 0;
});
client.on(Events.ShardReconnecting, shardId => {
  offlineSince ??= Date.now();
  console.warn('[DISCORD] Reconnexion du shard', shardId);
});
client.on(Events.ShardDisconnect, (event, shardId) => {
  offlineSince ??= Date.now();
  console.warn('[DISCORD] Déconnexion du shard', shardId, 'code', event.code);
});
client.on(Events.ShardResume, shardId => {
  console.log('[DISCORD] Connexion rétablie du shard', shardId);
});
client.on(Events.ShardError, error => console.error('[DISCORD] Gateway:', error.message));
client.on(Events.Error, error => console.error('[DISCORD]', error.message));
client.on(Events.Invalidated, () => {
  console.error('[DISCORD] Session invalidée, redémarrage du processus.');
  shutdown(1);
});

const connectionWatchdog = setInterval(() => {
  if (stopping) return;
  if (client.isReady()) {
    offlineSince = null;
    return;
  }
  offlineSince ??= Date.now();
  if (Date.now() - offlineSince >= 180000) {
    console.error('[DISCORD] Hors ligne depuis 3 minutes, redémarrage du processus.');
    shutdown(1);
  }
}, 15000);
connectionWatchdog.unref();

// Best-effort activity while this process is running; cannot wake a stopped instance.
let keepAliveTimer;
let keepAliveInProgress = false;
const renderUrl = process.env.RENDER_EXTERNAL_URL;
if (renderUrl && process.env.KEEP_ALIVE_ENABLED !== 'false') {
  try {
    const target = new URL('/', renderUrl);
    if (target.protocol === 'https:' && target.hostname.endsWith('.onrender.com')) {
      keepAliveTimer = setInterval(async () => {
        if (stopping || keepAliveInProgress) return;
        keepAliveInProgress = true;
        try {
          const response = await fetch(target, {
            signal: AbortSignal.timeout(10000),
            headers: { 'User-Agent': 'PlayWise-KeepAlive/1.0' }
          });
          await response.body?.cancel();
          if (!response.ok) console.warn('[WEB] Maintien actif: HTTP', response.status);
        } catch (error) {
          if (!stopping) console.warn('[WEB] Maintien actif:', error.message);
        } finally {
          keepAliveInProgress = false;
        }
      }, 300000);
      keepAliveTimer.unref();
      console.log('[WEB] Maintien actif toutes les 5 minutes (sans garantie sur Render gratuit).');
    }
  } catch {
    console.warn('[WEB] Adresse Render invalide, maintien actif désactivé.');
  }
}

const token = process.env.DISCORD_BOT_TOKEN;
async function connectDiscord() {
  if (stopping || loginInProgress || client.isReady()) return;
  loginInProgress = true;
  try {
    await client.login(token);
    attempts = 0;
  } catch (error) {
    console.error('[DISCORD] Connexion impossible:', error.message);
    if (['TokenInvalid', 'DisallowedIntents', 'InvalidIntents'].includes(error.code)) {
      console.error('[DISCORD] Vérifiez le token et les intents dans la configuration.');
      shutdown(1);
      return;
    }
    const delay = Math.min(5000 * (2 ** Math.min(attempts++, 4)), 60000);
    console.warn('[DISCORD] Nouvelle tentative dans', delay / 1000, 'secondes.');
    if (!stopping) retryTimer = setTimeout(connectDiscord, delay);
  } finally {
    loginInProgress = false;
  }
}

process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

if (!token) {
  console.error('[DISCORD] Variable DISCORD_BOT_TOKEN manquante.');
  shutdown(1);
} else {
  void connectDiscord();
}
