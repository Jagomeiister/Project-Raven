const axios = require('axios');
const fs = require('fs');
const winston = require('winston');

const path = require('path');
const { config } = require('dotenv');
config({ path: path.resolve(__dirname, '.env') });

const ELEVEN_LABS_API_KEY = process.env.ELEVEN_LABS_API_KEY;
const ELEVENAI_VOICE_ID = process.env.ELEVENAI_VOICE_ID;

const textToSpeech = async (text, filename = 'tts.mp3') => {
    try {
        console.log(`Generating TTS for text: ${text}`);
        const response = await axios.post(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENAI_VOICE_ID}`, { text }, {
            headers: { 'xi-api-key': ELEVEN_LABS_API_KEY },
            responseType: 'arraybuffer'
        });

        if (response.status === 200) {
            console.log(`Writing TTS audio to file: ${filename}`);
            fs.writeFileSync(filename, Buffer.from(response.data));
            const stats = fs.statSync(filename);
            console.log(`TTS file size: ${stats.size} bytes`);
            if (stats.size === 0) {
                winston.error('TTS file is empty.');
            } else {
                console.log('TTS file created successfully.');
            }
        } else {
            winston.error(`Request failed with status code: ${response.status}`);
            winston.error(`Response data: ${JSON.stringify(response.data)}`);
        }
    } catch (error) {
        winston.error(`Error in textToSpeech: ${error}`);
        if (error.response) {
            winston.error(`Response data: ${JSON.stringify(error.response.data)}`);
        }
    }
};

module.exports = { textToSpeech };
