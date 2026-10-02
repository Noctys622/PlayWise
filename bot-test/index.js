const http = require('http');
const {
  Client,
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
  ButtonStyle
} = require('discord.js');

const PORT = process.env.PORT || 3000;
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    ok: true,
    discord: client.isReady() ? 'online' : 'offline',
    guilds: client.isReady() ? client.guilds.cache.size : 0
  }));
});
server.listen(PORT, () => console.log('[WEB] Port', PORT));


const TICKET_CATEGORY_NAME = '📩 Tickets MP';

function ticketTopic(userId) {
  return 'DM_TICKET:' + userId;
}

async function getMainGuild() {
  const configured = process.env.DISCORD_GUILD_ID;
  if (configured) {
    const guild = client.guilds.cache.get(configured) || await client.guilds.fetch(configured).catch(() => null);
    if (guild) return guild;
  }
  return client.guilds.cache.first() || null;
}

async function getOrCreateTicketCategory(guild) {
  let category = guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name === TICKET_CATEGORY_NAME
  );

  if (!category) {
    category = await guild.channels.create({
      name: TICKET_CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel]
        }
      ]
    });
  }

  return category;
}

async function findTicketChannel(guild, userId) {
  return guild.channels.cache.find(
    c => c.type === ChannelType.GuildText && c.topic === ticketTopic(userId)
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

async function getOrCreateTicketChannel(guild, user) {
  let channel = await findTicketChannel(guild, user.id);
  if (channel) return channel;

  const category = await getOrCreateTicketCategory(guild);

  channel = await guild.channels.create({
    name: safeChannelName(user.username, user.id),
    type: ChannelType.GuildText,
    parent: category.id,
    topic: ticketTopic(user.id),
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      }
    ]
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📩 Nouveau ticket par MP')
    .setDescription('Un membre vient de contacter **PlayWise** en message privé.')
    .addFields(
      { name: 'Utilisateur', value: '<@' + user.id + '>', inline: true },
      { name: 'Pseudo', value: user.tag || user.username, inline: true },
      { name: 'ID', value: user.id, inline: false }
    )
    .setFooter({ text: 'Répondez directement dans ce salon. /close pour fermer.' })
    .setTimestamp();

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('close_dm_ticket')
      .setLabel('Fermer le ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({ embeds: [embed], components: [closeRow] });
  return channel;
}

async function relayDmToTicket(message) {
  const guild = await getMainGuild();
  if (!guild) {
    return message.reply("❌ Aucun serveur n'est configuré pour recevoir les tickets.");
  }

  const channel = await getOrCreateTicketChannel(guild, message.author);

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setAuthor({
      name: message.author.tag || message.author.username,
      iconURL: message.author.displayAvatarURL()
    })
    .setDescription(message.content || '*Message sans texte*')
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

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setAuthor({
      name: 'Support PlayWise • ' + message.author.username,
      iconURL: message.author.displayAvatarURL()
    })
    .setDescription(message.content || '*Message sans texte*')
    .setFooter({ text: 'Répondez simplement à ce MP pour continuer le ticket.' })
    .setTimestamp();

  const files = [...message.attachments.values()].map(a => a.url);

  await user.send({ embeds: [embed], files }).catch(async () => {
    await message.reply("❌ Impossible d'envoyer un MP à cet utilisateur.").catch(() => {});
  });
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

client.once('ready', async () => {
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
    if (interaction.isButton() && interaction.customId === 'close_dm_ticket') {
      const topic = interaction.channel?.topic || '';

      if (!topic.startsWith('DM_TICKET:')) {
        return interaction.reply({
          content: '❌ Ce bouton ne fonctionne que dans un ticket MP.',
          ephemeral: true
        });
      }

      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({
          content: '❌ Permission Gérer les salons requise.',
          ephemeral: true
        });
      }

      const userId = topic.slice('DM_TICKET:'.length);
      const user = await client.users.fetch(userId).catch(() => null);

      if (user) {
        await user.send('🔒 Ton ticket PlayWise a été fermé par le staff. Tu peux en ouvrir un nouveau depuis le serveur ou en envoyant un MP au bot.').catch(() => {});
      }

      await interaction.reply('🔒 Ticket fermé. Suppression du salon dans 3 secondes…');
      setTimeout(() => interaction.channel.delete('Ticket MP fermé via bouton').catch(() => {}), 3000);
      return;
    }

    if (interaction.isButton() && interaction.customId === 'open_dm_ticket') {
      const guild = interaction.guild;
      if (!guild) {
        return interaction.reply({ content: '❌ Ce bouton doit être utilisé depuis un serveur.', ephemeral: true });
      }

      const channel = await getOrCreateTicketChannel(guild, interaction.user);

      const welcome = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🎫 Ticket PlayWise ouvert')
        .setDescription(
          'Ton ticket a bien été créé.\n\n' +
          'Explique-moi ici ton problème ou ta demande. Tous tes messages seront transmis au staff PlayWise, et leurs réponses arriveront directement dans cette conversation.'
        )
        .setFooter({ text: 'PlayWise • Support privé' })
        .setTimestamp();

      let dmOk = true;
      await interaction.user.send({ embeds: [welcome] }).catch(() => { dmOk = false; });

      if (!dmOk) {
        return interaction.reply({
          content: '⚠️ Ton ticket a été créé, mais je ne peux pas t’envoyer de MP. Active les messages privés provenant des membres du serveur puis réessaie.',
          ephemeral: true
        });
      }

      await interaction.reply({
        content: '✅ Ton ticket est créé ! Je viens de t’envoyer un **message privé**. Continue la discussion dans tes MP.',
        ephemeral: true
      });

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_dm_ticket')
          .setLabel('Fermer le ticket')
          .setEmoji('🔒')
          .setStyle(ButtonStyle.Danger)
      );

      await channel.send({
        content: '🎫 Ticket ouvert depuis le bouton du panneau support par <@' + interaction.user.id + '>.',
        components: [closeRow]
      });
      return;
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
        .setTitle('🎫 Support PlayWise')
        .setDescription(
          'Besoin d’aide ? Ouvre un ticket privé avec notre équipe.\n\n' +
          'Clique sur le bouton ci-dessous : le bot créera ton ticket et t’enverra immédiatement un message privé pour continuer la discussion.\n\n' +
          '🔒 **Ta demande reste privée entre toi et le staff.**'
        )
        .setFooter({ text: 'PlayWise • Support' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('open_dm_ticket')
          .setLabel('Créer un ticket')
          .setEmoji('🎫')
          .setStyle(ButtonStyle.Primary)
      );

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
      const userId = message.channel.topic.slice('DM_TICKET:'.length);
      await relayStaffToUser(message, userId);
    }
  } catch (e) {
    console.error('[TICKET MP]', e);
  }
});

client.on('error', e => console.error('[DISCORD]', e));

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error('[DISCORD] Variable DISCORD_BOT_TOKEN manquante.');
} else {
  client.login(token).catch(e => console.error('[DISCORD] Connexion impossible:', e.message));
}

process.on('SIGTERM', () => {
  try { client.destroy(); } catch {}
  server.close(() => process.exit(0));
});
