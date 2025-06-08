const { Client, GatewayIntentBits } = require('discord.js');
const { config } = require('dotenv');
const winston = require('winston');
const path = require('path');
const fs = require('fs/promises');
const botConfig = require('./config.json');

// Load environment variables
config({ path: path.resolve(__dirname, '.env') });

// Environment variables
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const HELP_TICKET_CHANNEL_ID = process.env.HELP_TICKET_CHANNEL_ID;
const ELEVEN_LABS_API_KEY = process.env.ELEVEN_LABS_API_KEY;
const ELEVEN_LABS_VOICE_ID = process.env.ELEVEN_LABS_VOICE_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!DISCORD_BOT_TOKEN || !HELP_TICKET_CHANNEL_ID || !ELEVEN_LABS_API_KEY || !ELEVEN_LABS_VOICE_ID || !OPENAI_API_KEY || !GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('One or more environment variables are missing.');
    process.exit(1);
}

// Logger setup
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'user-service' },
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'bot.log' })
    ]
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Load modules
const handleVoiceStateUpdate = require('./modules/handleVoiceStateUpdate');
const handleCommands = require('./commands/handleCommands');

// Event listener for when the bot is ready
client.once('ready', async () => {
    logger.info(`Logged in as ${client.user.tag}`);
    const audioDir = path.join(__dirname, 'audio');

    try {
        await fs.rm(audioDir, { recursive: true, force: true });
        await fs.mkdir(audioDir);
    } catch (err) {
        logger.error(`Error preparing audio directory: ${err.message}`);
    }
});

// Event listener for voice state updates
client.on('voiceStateUpdate', handleVoiceStateUpdate(client, logger, botConfig));

// Event listener for messages
client.on('messageCreate', handleCommands(client, logger));

client.login(DISCORD_BOT_TOKEN);
