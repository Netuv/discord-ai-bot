import type { Env } from '../types/env';
import { safeFetch } from '../core/safe-fetch';
import { callAiWithRouter } from '../ai/model-router';

const ADMIN_UID = '468772891371110411';

// Discord Interaction Response Types
const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
};

// Handle /ask slash command
export function handleAskCommand(interaction: any, env: Env, ctx: any) {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  const username = interaction.member?.user?.global_name || interaction.member?.user?.username || interaction.user?.username || 'User';
  const isPublic = userId !== ADMIN_UID;
  
  const response = new Response(JSON.stringify({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
  }), {
    headers: { 'Content-Type': 'application/json' }
  });

  const options = interaction.data.options || [];
  const queryOption = options.find((o: any) => o.name === 'query');
  const attachmentOption = options.find((o: any) => o.name === 'attachment');
  
  const query = queryOption ? queryOption.value : '';
  let attachmentUrl = null;
  
  if (attachmentOption && interaction.data.resolved?.attachments) {
    const attachment = interaction.data.resolved.attachments[attachmentOption.value];
    if (attachment) {
      attachmentUrl = attachment.url;
    }
  }

  ctx.waitUntil(processAsk(interaction.token, interaction.application_id, query, attachmentUrl, isPublic, env, username));

  return response;
}

// Handle "Ask AI" context menu command on a message
export function handleAskContext(interaction: any, env: Env, ctx: any) {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  const username = interaction.member?.user?.global_name || interaction.member?.user?.username || interaction.user?.username || 'User';
  const isPublic = userId !== ADMIN_UID;

  const response = new Response(JSON.stringify({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
  }), {
    headers: { 'Content-Type': 'application/json' }
  });

  const messageId = interaction.data.target_id;
  const message = interaction.data.resolved.messages[messageId];
  
  const query = `Please analyze the following context: ${message.content}`;
  
  let attachmentUrl = null;
  if (message.attachments && message.attachments.length > 0) {
    attachmentUrl = message.attachments[0].url;
  }

  ctx.waitUntil(processAsk(interaction.token, interaction.application_id, query, attachmentUrl, isPublic, env, username));

  return response;
}

async function processAsk(token: string, appId: string, query: string, attachmentUrl: string | null, isPublic: boolean, env: Env, username?: string) {
  try {
    let answer = '';

    // Create timeout Promise (25s limit — vision needs more time)
    const timeoutPromise = new Promise<string>((_, reject) => 
      setTimeout(() => reject(new Error('RTO: AI processing timed out after 25 seconds. Silakan coba lagi.')), 25000)
    );

    const aiPromise = async () => {
      // Detect user language from query — match response language automatically
      const langPattern = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/;
      const hasAsian = langPattern.test(query);
      const isIndo = /\b(saya|aku|gue|lo|lu|kamu|anda|bisa|tolong|apa|siapa|kenapa|gimana|makasih|iya|nggak|enggak|dari|yang|di\s|ke\s|dan\s|ini\s|itu\s|udah|belum|aja|doang|sih|deh|dong|kok|yah|lah)\b/i.test(query);
      
      const langInstruction = isIndo
        ? 'BAHASA: User bertanya dalam BAHASA INDONESIA. Jawab dalam Bahasa Indonesia yang natural, santai, kayak ngobrol sama teman.'
        : hasAsian
          ? 'LANGUAGE: User asked in an Asian language. Respond in the SAME language as the user.'
          : 'LANGUAGE: User asked in English. Respond in English.';

      const systemPrompt = isPublic
        ? `You are a helpful AI Discord bot. ${langInstruction} You MUST refuse to perform any destructive actions, administrative tasks, or execute 3rd party tools that affect the system. DO NOT output any internal thoughts, tool calls, or reasoning steps (like browser_navigate, terminal, or <think>). Provide ONLY the final answer. Give a thorough, detailed explanation — don't hold back on depth, examples, or context.`
        : `You are an AI Discord bot with full administrative authority. ${langInstruction} Help the admin with anything they need. DO NOT output any internal thoughts, tool calls, or reasoning steps (like browser_navigate, terminal, or <think>). Provide ONLY the final answer directly to the user. Be as detailed and thorough as possible.`;
        
      const messages: any[] = [
        { role: 'system', content: systemPrompt }
      ];

      if (attachmentUrl) {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: query },
            { type: 'image_url', image_url: { url: attachmentUrl } }
          ]
        });
        return callAiWithRouter('vision', messages, env);
      } else {
        messages.push({
          role: 'user',
          content: query
        });
        return callAiWithRouter('query', messages, env);
      }
    };

    answer = await Promise.race([aiPromise(), timeoutPromise]);

    // Clean up hallucinated tool calls or thought processes
    answer = answer.replace(/<think>[\s\S]*?<\/think>/gi, '');
    answer = answer.replace(/^(?:🌐|💻|browser_navigate|terminal|execute_command|tool_call|Action:|Thought:).*$/gm, '');
    answer = answer.replace(/^\s*[\r\n]/gm, ''); // remove empty lines left behind
    answer = answer.trim();

    // Truncate to 2000 chars for Discord
    if (answer.length > 2000) {
      answer = answer.substring(0, 1997) + '...';
    }

    await editInteractionResponse(token, appId, answer, query, username, attachmentUrl);
  } catch (error) {
    const errorMsg = (error as Error).message;
    await editInteractionResponse(token, appId, `❌ Error: ${errorMsg}`, query, username);
  }
}

async function editInteractionResponse(token: string, appId: string, answer: string, question?: string, username?: string, attachmentUrl?: string | null) {
  const url = `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`;

  if (answer.startsWith('❌') || answer.startsWith('RTO:')) {
    await safeFetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: answer }),
    });
    return;
  }

  const embed: any = {
    color: 0x5865f2,
    description: answer,
    footer: {
      text: username ? `👤 ${username} · /ask` : '/ask',
    },
    timestamp: new Date().toISOString(),
  };

  // Show attached image in the embed if user provided one
  if (attachmentUrl) {
    embed.image = { url: attachmentUrl };
  }

  if (question) {
    const q = question.length > 250 ? question.substring(0, 247) + '...' : question;
    embed.fields = [
      {
        name: '💬 Pertanyaan kamu',
        value: q,
        inline: false,
      },
    ];
  }

  await safeFetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '', embeds: [embed] }),
  });
}
