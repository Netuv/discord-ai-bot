import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';
import type { Env } from '../types/env';
import { handleAskCommand, handleAskContext } from './ask';

export const interactionsRouter = new Hono<{ Bindings: Env }>();

interactionsRouter.post('/', async (c) => {
  // 1. Verify Request Signature
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  if (!signature || !timestamp || !c.env.DISCORD_PUBLIC_KEY) {
    return c.text('Missing signature headers or public key', 401);
  }

  const isValidRequest = await verifyKey(
    body,
    signature,
    timestamp,
    c.env.DISCORD_PUBLIC_KEY
  );

  if (!isValidRequest) {
    return c.text('Bad request signature', 401);
  }

  const interaction = JSON.parse(body);

  // 2. Handle PING
  if (interaction.type === 1) { // InteractionType.PING
    return c.json({ type: 1 }); // InteractionResponseType.PONG
  }

  // 3. Handle Application Commands
  if (interaction.type === 2) { // InteractionType.APPLICATION_COMMAND
    const { name } = interaction.data;

    if (name === 'ask') {
      return handleAskCommand(interaction, c.env, c.executionCtx);
    }
    if (name === 'Ask AI') {
      return handleAskContext(interaction, c.env, c.executionCtx);
    }
  }

  return c.json({ error: 'Unknown interaction' }, 400);
});
