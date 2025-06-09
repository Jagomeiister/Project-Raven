const fs = require('fs/promises');
const { SpeechClient } = require('@google-cloud/speech');
const winston = require('winston');

const defaultLogger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'transcription-service' },
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'bot.log' })
    ]
});

const speechClient = new SpeechClient();

const transcribeAudio = async (audioFilePath, logger = defaultLogger) => {
    try {
        const file = await fs.readFile(audioFilePath);
        const audioBytes = file.toString('base64');

        const audio = {
            content: audioBytes,
        };

        const config = {
            encoding: 'LINEAR16',
            sampleRateHertz: 48000,
            languageCode: 'en-US',
            audioChannelCount: 2,
        };

        const request = {
            audio: audio,
            config: config,
        };

        const [response] = await speechClient.recognize(request);
        const transcription = response.results
            .map(result => result.alternatives[0].transcript)
            .join('\n');

        return transcription;
    } catch (error) {
        logger.error(`Error in transcribeAudio: ${error}`);
        return null;
    }
};

module.exports = transcribeAudio;
