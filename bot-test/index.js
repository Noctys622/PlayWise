const http = require('http');
const {
  Client,
  GatewayIntentBits,
  ActivityType,
  EmbedBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits
} = require('discord.js');

const PORT = process.env.PORT || 3000;
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    ok: true,
    discord: client.isReady() ? 'online' : 'offline',
    guilds: client.isReady() ? client.guilds.cache.size : 0
  }));
});
server.listen(PORT, () => console.log('[WEB] Port', PORT));

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
  new SlashCommandBuilder().setName('status').setDescription('Affiche le statut du bot')
].map(c => c.toJSON());

client.once('ready', async () => {
  console.log('[DISCORD] Connecté en tant que', client.user.tag);
  client.user.setPresence({
    activities: [{ name: '/help • test', type: ActivityType.Playing }],
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
        .setTitle('🤖 Commandes de test')
        .setDescription([
          '/ping — latence',
          '/serverinfo — infos serveur',
          '/userinfo — infos membre',
          '/avatar — avatar',
          '/poll — sondage',
          '/status — état du bot',
          '/say — message du bot (staff)',
          '/embed — embed (staff)',
          '/clear — supprimer des messages (staff)'
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
        content: '🟢 Bot en ligne\nServeurs : **' + client.guilds.cache.size + '**\nPing : **' + client.ws.ping + ' ms**',
        ephemeral: true
      });
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
