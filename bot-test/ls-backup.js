const { SlashCommandBuilder, PermissionFlagsBits: P, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const model = require('./ls-custom.json');
const { randomBytes } = require('node:crypto');
const active = new Set();
const pending = new Map();
const MARKER = 'LS_CUSTOM_BACKUP_STATE_V1';
const STATE_NAME = '🔐・installation-ls-custom';
const items = model.categories.flatMap(cat => [cat, ...cat.channels]);
const command = new SlashCommandBuilder().setName('backupls')
  .setDescription('Installer la base LS Custom française (propriétaire du serveur)')
  .setDefaultMemberPermissions(P.Administrator);

function encode(state) {
  const value = JSON.stringify(state);
  if (value.length > 4096) throw new Error('Le suivi de l’installation dépasse la taille autorisée.');
  return { embeds: [{ title: MARKER, description: value, color: 0x3498db }] };
}
function convertOverwrites(item, guild, ids) {
  return item.overwrites.map(ow => ({ id: ow.role === 'everyone' ? guild.id : ids[model.roles.findIndex(r => r.key === ow.role)],
    type: 0, allow: BigInt(ow.allow), deny: BigInt(ow.deny) }));
}
async function preflight(guild) {
  await guild.roles.fetch();
  await guild.channels.fetch();
  const me = await guild.members.fetchMe();
  if (!me.permissions.has(P.Administrator)) throw new Error('Donne temporairement Administrateur au bot pour installer les permissions.');
  if (guild.roles.cache.some(r => r.id !== guild.id && r.id !== me.roles.highest.id && r.comparePositionTo(me.roles.highest) > 0))
    throw new Error('Place le rôle PlayWise tout en haut dans Paramètres du serveur → Rôles.');
  return me;
}
async function install(guild, botId, update) {
  await preflight(guild);
  const matches = guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.topic === MARKER);
  if (matches.size > 1) throw new Error('Plusieurs salons de suivi LS Custom existent. Fais vérifier leur contenu avant de continuer.');
  let tracker = matches.first();
  let message;
  let state = { v: 1, g: guild.id, r: [], c: [], m: [], done: false };
  if (tracker) {
    const messages = await tracker.messages.fetch({ limit: 100 });
    message = messages.find(m => m.author.id === botId && m.embeds[0]?.title === MARKER);
    if (!message) throw new Error('Suivi LS Custom incomplet : le message de suivi est manquant.');
    state = JSON.parse(message.embeds[0].description);
    if (state.v !== 1 || state.g !== guild.id || !Array.isArray(state.r) || !Array.isArray(state.c) || !Array.isArray(state.m))
      throw new Error('Suivi LS Custom invalide.');
  }
  // Do not adopt unknown roles, which could grant existing members private access.
  for (const [i, role] of model.roles.entries()) {
    if (state.r[i]) {
      if (!guild.roles.cache.has(state.r[i])) throw new Error('Un rôle déjà créé a été supprimé : ' + role.name);
    } else if (guild.roles.cache.some(r => r.name === role.name)) throw new Error('Rôle existant non suivi : ' + role.name + '. Renomme-le avant de relancer.');
  }
  for (const [i, item] of items.entries()) {
    if (state.c[i]) {
      if (!guild.channels.cache.has(state.c[i])) throw new Error('Un salon déjà créé a été supprimé : ' + item.name);
    } else if (guild.channels.cache.some(c => c.name === item.name)) throw new Error('Salon existant non suivi : ' + item.name + '. Renomme-le avant de relancer.');
  }
  if (state.done) { await update('✅ La base LS Custom est déjà installée. Aucun doublon créé.'); return; }
  if (guild.channels.cache.size + items.filter((_, i) => !state.c[i]).length + (tracker ? 0 : 1) > 500)
    throw new Error('Pas assez de place dans ce serveur pour les salons LS Custom.');
  if (guild.roles.cache.size + model.roles.filter((_, i) => !state.r[i]).length > 250)
    throw new Error('Pas assez de place dans ce serveur pour les rôles LS Custom.');
  if (!tracker) {
    tracker = await guild.channels.create({ name: STATE_NAME, type: ChannelType.GuildText, topic: MARKER,
      permissionOverwrites: [{ id: guild.id, deny: [P.ViewChannel] },
        { id: botId, type: 1, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.EmbedLinks] }],
      reason: 'Suivi privé de l’installation LS Custom' });
    message = await tracker.send(encode(state));
  }
  const save = () => message.edit(encode(state));
  await update('⏳ Installation LS Custom en cours. Tu peux garder Discord ouvert ; aucune autre commande n’est nécessaire.');
  for (let i = model.roles.length - 1; i >= 0; i--) {
    if (!state.r[i]) {
      const role = model.roles[i];
      const created = await guild.roles.create({ name: role.name, color: role.color, hoist: role.hoist,
        mentionable: false, permissions: BigInt(role.permissions), reason: 'Base LS Custom FR' });
      state.r[i] = created.id;
      await save();
    }
  }
  await guild.roles.setPositions(model.roles.map((_, i) => ({ role: state.r[i], position: model.roles.length - i })));
  for (const cat of model.categories) {
    for (const item of [cat, ...cat.channels]) {
      const index = items.indexOf(item);
      if (!state.c[index]) {
        const options = { name: item.name, type: item.type, permissionOverwrites: convertOverwrites(item, guild, state.r), reason: 'Base LS Custom FR' };
        if (item !== cat) options.parent = state.c[items.indexOf(cat)];
        if (item.type === ChannelType.GuildText) {
          options.topic = item.topic;
          options.rateLimitPerUser = item.slowmode || 0;
        }
        if (item.type === ChannelType.GuildVoice) options.userLimit = item.user_limit || 0;
        const channel = await guild.channels.create(options);
        state.c[index] = channel.id;
        await save();
      }
      if (item.message && !state.m.includes(index)) {
        const channel = guild.channels.cache.get(state.c[index]);
        // Recover a seed sent just before a restart without sending it twice.
        const recent = await channel.messages.fetch({ limit: 100 });
        if (!recent.some(m => m.author.id === botId && m.content === item.message))
          await channel.send({ content: item.message, allowedMentions: { parse: [] } });
        state.m.push(index);
        await save();
      }
      if ((index + 1) % 12 === 0) await update('⏳ LS Custom : ' + (index + 1) + '/' + items.length + ' salons et catégories prêts.');
    }
  }
  state.done = true;
  await save();
  await update('✅ **LS Custom installé !**\n69 salons (dont 8 vocaux), 12 catégories et 16 rôles.\nAttribue les grades dans les paramètres du serveur, puis complète horaires et tarifs. Les tickets, factures et journaux LS Custom restent manuels.\nLe salon privé de suivi permet d’éviter les doublons : conserve-le.');
}

async function handle(interaction) {
  const slash = interaction.isChatInputCommand?.() && interaction.commandName === 'backupls';
  const button = interaction.isButton?.() && interaction.customId.startsWith('lsbackup:');
  if (!slash && !button) return false;
  if (!interaction.guild || interaction.user.id !== interaction.guild.ownerId) {
    await interaction.reply({ content: '❌ Seul le propriétaire du serveur peut installer cette base.', ephemeral: true });
    return true;
  }
  if (active.has(interaction.guild.id)) {
    await interaction.reply({ content: '⏳ Une installation LS Custom est déjà en cours.', ephemeral: true });
    return true;
  }
  if (slash) {
    await interaction.deferReply({ ephemeral: true });
    try {
      await preflight(interaction.guild);
      const nonce = randomBytes(12).toString('hex');
      const key = interaction.guild.id + ':' + interaction.user.id;
      pending.set(key, { nonce, expires: Date.now() + 300000 });
      const timer = setTimeout(() => { if (pending.get(key)?.nonce === nonce) pending.delete(key); }, 300000);
      timer.unref?.();
      await interaction.editReply({ content: '**Installer LS Custom dans « ' + interaction.guild.name + ' » ?**\n69 salons, 12 catégories, 16 rôles et leurs permissions.\nLes salons existants sont conservés. Aucun rôle n’est attribué automatiquement.\nLes rôles Patron et Co-patron ont des droits de gestion. Les administrateurs existants gardent accès aux salons privés.\nUn salon privé supplémentaire conserve le suivi. Confirmation valable 5 minutes.',
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('lsbackup:yes:' + nonce).setLabel('Installer LS Custom').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('lsbackup:no:' + nonce).setLabel('Annuler').setStyle(ButtonStyle.Secondary))] });
    } catch (e) { await interaction.editReply({ content: '❌ ' + e.message, components: [] }); }
    return true;
  }
  const key = interaction.guild.id + ':' + interaction.user.id;
  const [, action, nonce] = interaction.customId.split(':');
  const record = pending.get(key);
  if (!record || record.nonce !== nonce || record.expires < Date.now()) {
    await interaction.reply({ content: 'Cette confirmation a expiré. Relance /backupls.', ephemeral: true });
    return true;
  }
  pending.delete(key);
  if (action !== 'yes') {
    await interaction.update({ content: 'Installation annulée.', components: [] });
    return true;
  }
  active.add(interaction.guild.id);
  try {
    await interaction.deferUpdate();
    const update = text => interaction.editReply({ content: text, components: [] }).catch(() => {});
    await install(interaction.guild, interaction.client.user.id, update);
  } catch (e) {
    console.error('[BACKUPLS]', e.message);
    await interaction.editReply({ content: '❌ Installation arrêtée : ' + e.message + '\nLes éléments déjà créés sont conservés. Corrige le problème puis relance /backupls pour reprendre.', components: [] }).catch(() => {});
  } finally { active.delete(interaction.guild.id); }
  return true;
}
module.exports = { command, handle, install, encode, convertOverwrites, model, items };
