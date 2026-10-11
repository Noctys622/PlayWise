'use strict';

const pending = new Map();

// Serialize a user's creation, replies, claim and closure, without blocking other tickets.
async function withTicketLock(key, action) {
  const previous = pending.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(action);
  pending.set(key, current);
  try {
    return await current;
  } finally {
    if (pending.get(key) === current) pending.delete(key);
  }
}

// A failed page must abort closure; never silently archive an incomplete conversation.
async function fetchTranscriptMessages(channel) {
  const messages = [];
  let before;
  for (;;) {
    const page = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!page.size) break;
    messages.push(...page.values());
    const oldest = page.last().id;
    if (oldest === before) throw new Error('La pagination du transcript n’avance pas.');
    before = oldest;
    if (page.size < 100) break;
  }
  return messages;
}

module.exports = { withTicketLock, fetchTranscriptMessages };
