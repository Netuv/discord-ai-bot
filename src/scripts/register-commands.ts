declare const process: any;

// Get secrets from args or env
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  console.error("Missing DISCORD_TOKEN or DISCORD_CLIENT_ID environment variable.");
  console.error("Run it like: DISCORD_TOKEN=... DISCORD_CLIENT_ID=... npx tsx src/scripts/register-commands.ts");
  process.exit(1);
}

const commands = [
  {
    name: 'ask',
    description: 'Ask the AI any question',
    type: 1, // CHAT_INPUT
    options: [
      {
        name: 'query',
        description: 'Your question or prompt for the AI',
        type: 3, // STRING
        required: true,
      },
      {
        name: 'attachment',
        description: 'Optional image or file to provide as context',
        type: 11, // ATTACHMENT
        required: false,
      }
    ]
  },
  {
    name: 'Ask AI',
    type: 3, // MESSAGE context menu
  }
];

async function main() {
  try {
    console.log('Started refreshing application (/) commands.');

    const res = await fetch(`https://discord.com/api/v10/applications/${DISCORD_CLIENT_ID}/commands`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bot ${DISCORD_TOKEN}`
      },
      body: JSON.stringify(commands)
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to register commands: ${res.status} ${err}`);
    }

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
}

main();
