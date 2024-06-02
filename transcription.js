const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const winston = require('winston');

const path = require('path');
const { config } = require('dotenv');
config({ path: path.resolve(__dirname, '.env') });


const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const transcribeAudioWithOpenAI = async (audio_path) => {
    try {
        const form = new FormData();
        form.append('file', fs.createReadStream(audio_path));
        form.append('model', 'whisper-1');
        form.append('language', 'en');
        const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                ...form.getHeaders()
            }
        });

        if (response.status === 200) {
            return response.data.text;
        } else {
            winston.error(`Failed to transcribe audio with status code: ${response.status}`);
            winston.error(`Response data: ${JSON.stringify(response.data)}`);
            return null;
        }
    } catch (error) {
        winston.error(`Error in transcribeAudioWithOpenAI: ${error}`);
        if (error.response) {
            winston.error(`Response data: ${JSON.stringify(error.response.data)}`);
        }
        return null;
    }
};

module.exports = { transcribeAudioWithOpenAI };
