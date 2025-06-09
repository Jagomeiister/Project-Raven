const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const ffmpeg = require('fluent-ffmpeg');
const textToSpeech = require('../tts');
const transcribeAudio = require('../transcription');

module.exports = (client, logger, botConfig) => async (oldState, newState) => {
    const user = newState.member.user;
    const newChannel = newState.channel;
    const HELP_TICKET_CHANNEL_ID = process.env.HELP_TICKET_CHANNEL_ID;

    if (newChannel && newChannel.id === HELP_TICKET_CHANNEL_ID) {
        const connection = joinVoiceChannel({
            channelId: newChannel.id,
            guildId: newChannel.guild.id,
            adapterCreator: newChannel.guild.voiceAdapterCreator,
        });

        connection.on(VoiceConnectionStatus.Ready, () => {
            logger.info('Connected to voice channel.');
            sendWelcomeMessage(connection, user, logger, botConfig, client);
        });

        connection.on('error', (error) => {
            logger.error(`Voice connection error: ${error.message}`);
        });
    }
};

const sendWelcomeMessage = async (connection, user, logger, botConfig, client) => {
    const botUsername = client.user.username;
    const greetingMessage = botConfig.greetingMessage.replace('{bot_username}', botUsername);
    const ttsFile = path.join(__dirname, '..', 'audio', 'welcome_tts.mp3');

    try {
        logger.info(`Generating TTS for text: ${greetingMessage}`);
        await textToSpeech(greetingMessage, ttsFile, logger);
        logger.info(`TTS audio file created at: ${ttsFile}`);

        try {
            const stats = await fsPromises.stat(ttsFile);
            if (stats.size === 0) {
                logger.error('TTS file does not exist or is empty.');
                return;
            }
        } catch (err) {
            logger.error('TTS file does not exist or is empty.');
            return;
        }

        const player = createAudioPlayer();
        const resource = createAudioResource(ttsFile);

        player.play(resource);
        connection.subscribe(player);

        player.on(AudioPlayerStatus.Playing, () => {
            logger.info('Audio player is playing.');
        });

        player.on(AudioPlayerStatus.Idle, () => {
            logger.info('Audio player is idle.');
            startRecordingAndTranscription(connection, user, logger);
        });

        player.on('error', error => {
            logger.error(`Audio player error: ${error.message}`);
        });
    } catch (error) {
        logger.error(`Error in sendWelcomeMessage: ${error.message}`);
    }
};

const startRecordingAndTranscription = async (connection, user, logger) => {
    const audioDir = path.join(__dirname, '..', 'audio');
    const audioFilePath = path.join(audioDir, `recorded_audio_${user.id}.pcm`);

    try {
        await fsPromises.access(audioDir);
    } catch {
        await fsPromises.mkdir(audioDir, { recursive: true });
    }

    const receiver = connection.receiver;
    const audioStream = receiver.subscribe(user.id, { end: 'manual' });

    const writeStream = fs.createWriteStream(audioFilePath);

    audioStream.pipe(writeStream);

    audioStream.on('end', async () => {
        writeStream.close();
        logger.info('Finished recording audio');

        const wavFilePath = audioFilePath.replace('.pcm', '.wav');

        ffmpeg(audioFilePath)
            .inputFormat('s16le')
            .audioFrequency(48000)
            .audioChannels(2)
            .save(wavFilePath)
            .on('end', async () => {
                logger.info(`Saved WAV file: ${wavFilePath}`);
                const transcription = await transcribeAudio(wavFilePath);
                if (transcription) {
                    logger.info(`Transcription: ${transcription}`);
                } else {
                    logger.error('Failed to transcribe audio.');
                }
            });
    });
};
