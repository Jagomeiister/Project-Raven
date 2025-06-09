const axios = require('axios');
const fs = require('fs/promises');
const winston = require('winston');

const ELEVEN_LABS_API_KEY = process.env.ELEVEN_LABS_API_KEY;
const ELEVEN_LABS_VOICE_ID = process.env.ELEVEN_LABS_VOICE_ID;

const defaultLogger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'tts-service' },
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'bot.log' })
    ]
});

const textToSpeech = async (text, filename = 'tts.mp3', logger = defaultLogger) => {
    try {
        logger.info(`Generating TTS for text: ${text}`);
        const response = await axios.post(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_LABS_VOICE_ID}`, { text }, {
            headers: { 'xi-api-key': ELEVEN_LABS_API_KEY },
            responseType: 'arraybuffer'
        });

        if (response.status === 200) {
            logger.info(`Writing TTS audio to file: ${filename}`);
            await fs.writeFile(filename, Buffer.from(response.data));
            const stats = await fs.stat(filename);
            logger.info(`TTS file size: ${stats.size} bytes`);
            if (stats.size === 0) {
                logger.error('TTS file is empty.');
            } else {
                logger.info('TTS file created successfully.');
            }
        } else {
            logger.error(`Request failed with status code: ${response.status}`);
            logger.error(`Response data: ${JSON.stringify(response.data)}`);
        }
    } catch (error) {
        logger.error(`Error in textToSpeech: ${error}`);
        if (error.response) {
            logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
        }
    }
};

module.exports = textToSpeech;
