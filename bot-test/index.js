const http = require('http');
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.DISCORD_BOT_TOKEN;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    ok: true,
    service: 'test',
    discord: client?.isReady?.() ? 'online' : 'waiting'
  }));
});

server.listen(PORT, () => {
  console.log('[WEB] Health server listening on port', PORT);
});

let client = null;

if (!TOKEN) {
  console.log('[DISCORD] DISCORD_BOT_TOKEN manquant. Le service reste actif mais le bot ne peut pas se connecter.');
} else {
  client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  client.once('ready', () => {
    console.log('[DISCORD] Connecté en tant que ' + client.user.tag);
    client.user.setPresence({
      activities: [{ name: 'test', type: ActivityType.Playing }],
      status: 'online'
    });
  });

  client.on('error', err => console.error('[DISCORD] Client error:', err));

  client.login(TOKEN).catch(err => {
    console.error('[DISCORD] Connexion impossible:', err.message);
  });
}

process.on('SIGTERM', async () => {
  try { await client?.destroy(); } catch {}
  server.close(() => process.exit(0));
});
