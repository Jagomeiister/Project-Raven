# Project Raven

Project Raven is a Discord bot that joins a voice channel when summoned and can generate text-to-speech greetings using ElevenLabs and transcribe voice input using Google Cloud Speech. Logs are maintained via Winston. Although the project includes the OpenAI client, it is not currently used by the bot.

## Environment Variables
Copy `.env.example` to `.env` in the project root and fill in your values for the following variables:

- `DISCORD_BOT_TOKEN` – Discord bot token used to authenticate with Discord.
- `HELP_TICKET_CHANNEL_ID` – Channel ID the bot watches for help ticket requests.
- `ELEVEN_LABS_API_KEY` – API key for ElevenLabs text to speech service.
- `ELEVEN_LABS_VOICE_ID` – Voice ID for ElevenLabs TTS output.
- `OPENAI_API_KEY` – *(currently unused)* API key reserved for future OpenAI features.
- `GOOGLE_APPLICATION_CREDENTIALS` – Path to the Google Cloud service account JSON file used for speech transcription.

## Installation
1. Install [Node.js](https://nodejs.org/) (version 20 or newer recommended).
2. Install the project dependencies:
   ```bash
   npm install
   ```
**Note:** ffmpeg must be installed and available in your system PATH.

## Running the Bot
After creating the `.env` file and installing dependencies, start the bot with:

```bash
npm start
```

This command runs `node index.js` internally to launch the bot.

The bot will connect to Discord using the provided token and begin listening for voice channel events.
