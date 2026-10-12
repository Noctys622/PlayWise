const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Collection, PermissionsBitField, PermissionFlagsBits: P } = require('discord.js');
const ls = require('../ls-backup');

function fixture() {
  let sequence = 100000000000000000n;
  let creations = 0;
  let failure = Infinity;
  const id = () => String(sequence++);
  const botId = '999999999999999999';
  const role = { id: '888888888888888888', position: 999 };
  const guild = { id: '777777777777777777', ownerId: '111', name: 'Test LS',
    members: { fetchMe: async () => ({ permissions: new PermissionsBitField(P.Administrator), roles: { highest: role } }) },
    roles: { cache: new Collection(), fetch: async () => {}, setPositions: async () => {} },
    channels: { cache: new Collection(), fetch: async () => {} } };
  guild.roles.cache.set(guild.id, { id: guild.id, name: '@everyone' });
  guild.roles.cache.set(role.id, role);
  guild.roles.create = async options => {
    const r = { ...options, id: id(), position: 1, comparePositionTo: other => 1 - other.position };
    guild.roles.cache.set(r.id, r); return r;
  };
  guild.channels.create = async options => {
    if (++creations === failure) throw new Error('Simulated interruption');
    const history = new Collection();
    const channel = { ...options, id: id(), messages: { fetch: async () => history },
      send: async payload => {
        const m = { id: id(), author: { id: botId }, content: payload.content, embeds: payload.embeds || [],
          edit: async p => { m.embeds = p.embeds; return m; } };
        history.set(m.id, m); return m;
      } };
    guild.channels.cache.set(channel.id, channel); return channel;
  };
  return { guild, botId, failAt: n => { failure = n; } };
}

test('complete installation and restart preserve counts and private permissions', async () => {
  const { guild, botId } = fixture();
  await ls.install(guild, botId, async () => {});
  assert.equal(guild.roles.cache.size, 18);
  assert.equal(guild.channels.cache.size, 82); // 81 model items + private checkpoint
  const tracker = guild.channels.cache.find(c => c.topic === 'LS_CUSTOM_BACKUP_STATE_V1');
  const checkpoint = (await tracker.messages.fetch()).first();
  assert.ok(checkpoint.embeds[0].description.length < 4096);
  const state = JSON.parse(checkpoint.embeds[0].description);
  assert.equal(state.done, true);
  for (const [index, item] of ls.items.entries()) {
    const channel = guild.channels.cache.get(state.c[index]);
    const publicRoom = item.profile.startsWith('public_');
    const everyone = channel.permissionOverwrites.find(o => o.id === guild.id);
    assert.equal(Boolean(BigInt(everyone.allow) & P.ViewChannel), publicRoom);
    assert.equal(Boolean(BigInt(everyone.deny) & P.ViewChannel), !publicRoom);
    for (const o of channel.permissionOverwrites) assert.equal(BigInt(o.allow) & BigInt(o.deny), 0n);
  }
  await ls.install(guild, botId, async () => {});
  assert.equal(guild.channels.cache.size, 82);
  assert.equal(guild.roles.cache.size, 18);
});

test('interrupted installation resumes using Discord checkpoint', async () => {
  const f = fixture(); f.failAt(19);
  await assert.rejects(ls.install(f.guild, f.botId, async () => {}), /interruption/);
  assert.equal(f.guild.channels.cache.size, 18);
  await ls.install(f.guild, f.botId, async () => {});
  assert.equal(f.guild.channels.cache.size, 82);
  assert.equal(f.guild.roles.cache.size, 18);
});

test('unknown role collision is rejected before creating anything', async () => {
  const f = fixture();
  f.guild.roles.cache.set('old', { id: 'old', name: ls.model.roles[0].name, comparePositionTo: () => -1 });
  await assert.rejects(ls.install(f.guild, f.botId, async () => {}), /Rôle existant non suivi/);
  assert.equal(f.guild.channels.cache.size, 0);
});

test('only guild owner can start command or confirm it', async () => {
  const f = fixture(); let result;
  for (const isSlash of [true, false]) {
    await ls.handle({ guild: f.guild, user: { id: 'someone-else' }, commandName: 'backupls', customId: 'lsbackup:yes:bad',
      isChatInputCommand: () => isSlash, isButton: () => !isSlash, reply: async r => { result = r; } });
    assert.match(result.content, /propriétaire/);
  }
  assert.equal(f.guild.channels.cache.size, 0);
});

test('owner confirmation requires an issued nonce; cancel creates nothing', async () => {
  const f = fixture(); let response;
  const common = { guild: f.guild, user: { id: '111' }, client: { user: { id: f.botId } },
    reply: async p => { response = p; }, editReply: async p => { response = p; }, update: async p => { response = p; } };
  await ls.handle({ ...common, isChatInputCommand: () => false, isButton: () => true, customId: 'lsbackup:yes:forged' });
  assert.match(response.content, /expiré/);
  await ls.handle({ ...common, isChatInputCommand: () => true, isButton: () => false, commandName: 'backupls', deferReply: async () => {} });
  const cancel = response.components[0].components[1].data.custom_id;
  await ls.handle({ ...common, isChatInputCommand: () => false, isButton: () => true, customId: cancel });
  assert.match(response.content, /annulée/);
  assert.equal(f.guild.channels.cache.size, 0);
});
