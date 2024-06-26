const fs = require('fs');
const { SpeechClient } = require('@google-cloud/speech');
const winston = require('winston');
const path = require('path');
const { config } = require('dotenv');
config({ path: path.resolve(__dirname, '..', '.env') });

const speechClient = new SpeechClient();

const transcribeAudio = async (audioFilePath) => {
    try {
        const file = fs.readFileSync(audioFilePath);
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
        winston.error(`Error in transcribeAudio: ${error}`);
        return null;
    }
};

module.exports = transcribeAudio;
