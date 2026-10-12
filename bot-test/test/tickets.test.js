const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Collection, PermissionFlagsBits } = require('discord.js');
const { withTicketLock, fetchTranscriptMessages } = require('../ticket-core');

function harness() {
  const source = fs.readFileSync(require.resolve('../index.js'), 'utf8').split('// discord.js handles normal gateway reconnections.')[0];
  const context = vm.createContext({ require: name => name === 'http' ? {
    createServer: () => ({ listen() {}, on() {} })
  } : name === './ticket-core' ? require('../ticket-core') : name === './ls-backup' ? require('../ls-backup') : require(name),
  process: { env: {} }, console, Buffer });
  vm.runInContext(source + '\nthis.bot = { client, handleInteraction, openTicket, parseTicketTopic, canCloseTicket, buildTranscript };', context);
  const bot = context.bot;
  bot.client.user = { id: '999', displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' };
  return bot;
}

function fixture() {
  const bot = harness();
  const stats = { created: 0, deleted: 0, sent: [], archived: [] };
  const staffRole = { id: '888', name: 'Support', position: 1 };
  const guild = { id: '777', roles: { everyone: { id: '777' }, cache: new Collection([['888', staffRole]]) }, channels: { cache: new Collection() } };
  const category = { id: '555', name: '📩・tickets-mp', type: 4 };
  guild.channels.cache.set(category.id, category);
  const logs = { id: '556', name: '📜・ticket-logs', type: 0, parentId: '555', send: async payload => { stats.archived.push(payload); } };
  guild.channels.cache.set(logs.id, logs);
  guild.channels.fetch = async id => guild.channels.cache.get(id);
  guild.channels.create = async data => {
    stats.created++;
    const channel = { ...data, guild, id: '666', type: 0,
      messages: { fetch: async () => new Collection() },
      send: async payload => stats.sent.push(payload),
      delete: async () => { stats.deleted++; guild.channels.cache.delete('666'); },
      setTopic: async topic => { channel.topic = topic; } };
    guild.channels.cache.set(channel.id, channel);
    return channel;
  };
  const user = { id: '111', username: 'Thibaut', displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png',
    send: async () => ({ channelId: '222', edit: async () => {} }) };
  bot.client.users.fetch = async () => user;
  bot.client.guilds.cache.set(guild.id, guild);
  const interaction = { guild, guildId: guild.id, user, editReply: async payload => { stats.reply = payload; } };
  return { bot, stats, guild, logs, user, interaction };
}

test('simultaneous openings create one channel; other users proceed independently', async () => {
  const f = fixture();
  await Promise.all(Array.from({ length: 5 }, () => withTicketLock('777:111', () => f.bot.openTicket(f.interaction, 'bot', 'Mon bouton ne fonctionne plus.'))));
  assert.equal(f.stats.created, 1);
  assert.equal(f.stats.sent.length, 2);
  assert.equal(f.guild.channels.cache.get('666').topic, 'DM_TICKET:111|SUBJECT:bot');
});

test('closed DMs never create a staff channel', async () => {
  const f = fixture();
  f.user.send = async () => { throw new Error('Cannot send messages'); };
  await f.bot.openTicket(f.interaction, 'site', 'Le site ne fonctionne plus.');
  assert.equal(f.stats.created, 0);
  assert.match(f.stats.reply.content, /messages privés/);
});

test('failed initial message removes the incomplete ticket', async () => {
  const f = fixture();
  const original = f.guild.channels.create;
  f.guild.channels.create = async data => {
    const c = await original(data); c.send = async () => { throw new Error('Missing permissions'); }; return c;
  };
  await assert.rejects(f.bot.openTicket(f.interaction, 'bot'), /Missing permissions/);
  assert.equal(f.stats.deleted, 1);
});

test('transcript fetches all 235 messages with pagination and preserves failures', async () => {
  const all = Array.from({ length: 235 }, (_, i) => ({ id: String(1000 - i) }));
  const calls = [];
  const channel = { messages: { fetch: async opts => {
    calls.push(opts);
    const start = opts.before ? all.findIndex(m => m.id === opts.before) + 1 : 0;
    return new Collection(all.slice(start, start + 100).map(m => [m.id, m]));
  } } };
  assert.equal((await fetchTranscriptMessages(channel)).length, 235);
  assert.equal(calls.length, 3);
  channel.messages.fetch = async () => { throw new Error('Fetch failed'); };
  await assert.rejects(fetchTranscriptMessages(channel), /Fetch failed/);
});

test('author and configured staff can close; unrelated member cannot', () => {
  const f = fixture();
  const channel = { guild: f.guild };
  const data = { userId: '111' };
  assert.equal(f.bot.canCloseTicket(f.interaction, channel, data), true);
  const staff = { user: { id: '444' }, guildId: '777', member: { permissions: { has: () => false }, roles: { cache: new Collection([['888', {}]]) } } };
  assert.equal(f.bot.canCloseTicket(staff, channel, data), true);
  staff.member.roles.cache.clear();
  assert.equal(f.bot.canCloseTicket(staff, channel, data), false);
  staff.member.permissions.has = bit => bit === PermissionFlagsBits.ManageChannels;
  assert.equal(f.bot.canCloseTicket(staff, channel, data), true);
});

test('archive failure keeps ticket and does not notify user of closure', async () => {
  const f = fixture();
  await f.bot.openTicket(f.interaction, 'bot', 'Description de la demande.');
  f.logs.send = async () => { throw new Error('Archive unavailable'); };
  let notified = false;
  f.user.send = async () => { notified = true; };
  const i = { ...f.interaction, customId: 'close_dm_ticket_modal:666', deferred: true, replied: false,
    channel: f.guild.channels.cache.get('666'), isButton: () => false, isModalSubmit: () => true,
    fields: { getTextInputValue: () => 'Résolu' } };
  await f.bot.handleInteraction(i);
  assert.equal(f.stats.deleted, 0);
  assert.equal(notified, false);
  assert.match(f.stats.reply.content, /conservé/);
});

test('closure archives before deletion and notifies author', async () => {
  const f = fixture();
  await f.bot.openTicket(f.interaction, 'discord', 'Description de la demande.');
  const channel = f.guild.channels.cache.get('666');
  const originalDelete = channel.delete;
  channel.delete = async () => { assert.equal(f.stats.archived.length, 1); await originalDelete(); };
  let notified = false;
  f.user.send = async () => { notified = true; };
  const i = { ...f.interaction, customId: 'close_dm_ticket_modal:666', deferred: true,
    channel, isButton: () => false, isModalSubmit: () => true,
    fields: { getTextInputValue: () => 'Résolu' } };
  await f.bot.handleInteraction(i);
  assert.equal(f.stats.deleted, 1);
  assert.equal(notified, true);
});

test('failed queued task does not block the next action', async () => {
  const events = [];
  const first = withTicketLock('failure', async () => { events.push(1); throw new Error('Fail'); });
  const second = withTicketLock('failure', async () => { events.push(2); return 'ok'; });
  await assert.rejects(first, /Fail/);
  assert.equal(await second, 'ok');
  assert.deepEqual(events, [1, 2]);
});

test('configured support role can claim and update status without moderation permissions', async () => {
  const f = fixture();
  await f.bot.openTicket(f.interaction, 'bot', 'Description de la demande.');
  const channel = f.guild.channels.cache.get('666');
  let updated;
  const i = { ...f.interaction, channel, user: { id: '444', username: 'Noctys' },
    customId: 'claim_dm_ticket', member: { permissions: { has: () => false }, roles: { cache: new Collection([['888', {}]]) } },
    message: { edit: async payload => { updated = payload; } }, isButton: () => true };
  await f.bot.handleInteraction(i);
  assert.equal(channel.topic, 'DM_TICKET:111|SUBJECT:bot|CLAIM:444');
  assert.equal(updated.components[0].toJSON().components[0].disabled, true);
});

test('category selection opens the description modal and submission creates the ticket', async () => {
  const f = fixture();
  let modal;
  await f.bot.handleInteraction({ ...f.interaction, customId: 'ticket_subject_menu', values: ['signalement'],
    isButton: () => false, isModalSubmit: () => false, isStringSelectMenu: () => true,
    showModal: async value => { modal = value.toJSON(); } });
  assert.equal(modal.custom_id, 'open_ticket_modal:signalement');
  assert.equal(modal.components[0].components[0].max_length, 2000);
  await f.bot.handleInteraction({ ...f.interaction, customId: modal.custom_id, isButton: () => false,
    isModalSubmit: () => true, isStringSelectMenu: () => false,
    fields: { getTextInputValue: () => 'Je souhaite signaler un problème.' } });
  assert.equal(f.stats.created, 1);
  assert.equal(f.guild.channels.cache.get('666').topic, 'DM_TICKET:111|SUBJECT:signalement');
});
