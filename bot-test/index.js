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
  PermissionsBitField
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

  await channel.send({ embeds: [embed] });
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
  new SlashCommandBuilder().setName('close').setDescription('Ferme un ticket MP')
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
  if (!interaction.isChatInputCommand()) return;

  try {
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
