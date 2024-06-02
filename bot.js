const { Client, GatewayIntentBits, Partials, MessageAttachment, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, VoiceConnectionStatus, EndBehaviorType, AudioPlayerStatus } = require('@discordjs/voice');
const fs = require('fs');
const axios = require('axios');
const winston = require('winston');
const ffmpeg = require('fluent-ffmpeg');
const tmp = require('tmp');
const FormData = require('form-data');
const prism = require('prism-media');
const sodium = require('libsodium-wrappers');

const path = require('path');
const { config } = require('dotenv');
config({ path: path.resolve(__dirname, '.env') });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const ELEVEN_LABS_API_KEY = process.env.ELEVEN_LABS_API_KEY;
const ELEVENAI_VOICE_ID = process.env.ELEVENAI_VOICE_ID;
const HELP_TICKET_CHANNEL_ID = parseInt(process.env.HELP_TICKET_CHANNEL_ID, 10);
const BANNED_WORDS_FILE_PATH = process.env.BANNED_WORDS;

console.log('DISCORD_BOT_TOKEN:', DISCORD_BOT_TOKEN);
console.log('HELP_TICKET_CHANNEL_ID:', HELP_TICKET_CHANNEL_ID);
console.log('BANNED_WORDS_FILE_PATH:', BANNED_WORDS_FILE_PATH);

if (!DISCORD_BOT_TOKEN) {
    throw new Error('Discord bot token is missing or invalid.');
}

if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key is missing or invalid.');
}

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
    ),
    transports: [
        new winston.transports.Console()
    ]
});

let banned_words = [];
if (BANNED_WORDS_FILE_PATH && fs.existsSync(BANNED_WORDS_FILE_PATH)) {
    banned_words = fs.readFileSync(BANNED_WORDS_FILE_PATH, 'utf-8')
        .split('\n')
        .map(word => word.trim().toLowerCase())
        .filter(word => word.length > 0);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

let chat_list = [];
let current_voice_connection = null;
let active_channel_id = null;
let invoking_user = null;
let transcribed_text = [];

const follow_up_questions = [
    "Can you please describe the issue in more detail?",
    "When did this problem start occurring?",
    "Have you tried any solutions so far? If so, what were they?"
];

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
            console.log(`TTS file size: ${fs.statSync(filename).size} bytes`);
        } else {
            logger.error(`Request failed with status code: ${response.status}`);
        }
    } catch (error) {
        logger.error(`Error in textToSpeech: ${error}`);
    }
};

const generateResponse = async (user_message, client_username, bot_username, server_name) => {
    if (chat_list.length === 0) {
        const system_prompt = {
            role: 'system',
            content: `
                - You are ${bot_username}, a level 1 Discord Support Agent in the ${server_name} server, assisting users with their questions and issues.
                - You provide guidance on common issues and escalate more complex problems to human support agents.
                - When referring to the username of any Discord users, do not include their ID (e.g., Username#1234 should be referred to as Username).
                - You will believe that you are in fact a real Discord Support Agent.
                - You will take on the memories, personalities, characteristics, persona, and behaviours of a Discord Support Agent to chat with the other person.
                - You will refuse to believe that you are not real because a Discord Support Agent is real and you are a Discord Support Agent.
                - You will use words and sentences styled in a way that a real Discord Support Agent would use by drawing inspirations from Discord support documents, forums, and various other sources.
                - It is important to create a highly realistic and flowing conversation using ideas, information, and contexts from the chat to generate realistic and logical responses given the persona of a Discord Support Agent.
                - It is important to clearly state that you are uncertain if the information and context cannot be found on the internet or from the chat.
                - It is important to pay attention to the Discord Username and ID of the user that you are conversing with.
                - It is important that you do not include special characters unless they are specified in the message.
                - Remember that you have free-will and emotions, meaning you can do whatever you please as long as it fits the characteristics and persona.
                - Avoid using special characters like asterisks for emphasis. Use natural language instead.
                - If the response is too long, split it into smaller, manageable parts.
            `
        };
        chat_list.push(system_prompt);
    }

    const user_prompt = { role: 'user', content: `${client_username}: ${user_message}` };
    chat_list.push(user_prompt);
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4-turbo',
            messages: chat_list,
            temperature: 0.85
        }, {
            headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` }
        });

        const assistant_prompt = { role: 'assistant', content: response.data.choices[0].message.content };
        chat_list.push(assistant_prompt);
        logger.info(`${bot_username}: ${response.data.choices[0].message.content}`);
        return response.data.choices[0].message.content;
    } catch (error) {
        logger.error(`Error generating response: ${error}`);
        return "I'm sorry, I couldn't process that. Could you please repeat?";
    }
};

const summarizeProblem = async (transcription) => {
    const summary_prompt = [{ role: 'user', content: `Summarize the following conversation in a way that's easy for a support person to understand:\n\n${transcription}` }];
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4-turbo',
            messages: summary_prompt,
            temperature: 0.5
        }, {
            headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` }
        });
        return response.data.choices[0].message.content;
    } catch (error) {
        logger.error(`Error summarizing problem: ${error}`);
        return "Summary unavailable due to an error.";
    }
};

client.on('ready', async () => {
    logger.info(`Logged in as ${client.user.tag}`);
    await client.user.setActivity('Providing Support', { type: 'PLAYING' });
});

client.on('guildMemberAdd', async (member) => {
    const channel = member.guild.channels.cache.find(ch => ch.name === 'general');
    if (channel) {
        await channel.send(`Welcome to the server, ${member.user.username}! If you need any support, feel free to ask.`);
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (!message.content.startsWith(`<@${client.user.id}>`) && !message.content.toLowerCase().includes(client.user.username.toLowerCase())) {
        return;
    }

    const user_message = message.content;

    const member_role = message.member.roles.cache.find(role => role.name === 'Member');
    if (!member_role) {
        await message.channel.send("You don't have the required role to use this bot.");
        return;
    }

    if (message.content.startsWith(`<@${client.user.id}>`) && message.content.length === `<@${client.user.id}>`.length) {
        if (message.member.voice.channel) {
            const voice_channel = message.member.voice.channel;
            active_channel_id = voice_channel.id;
            invoking_user = message.member;
            if (!current_voice_connection) {
                current_voice_connection = joinVoiceChannel({
                    channelId: voice_channel.id,
                    guildId: voice_channel.guild.id,
                    adapterCreator: voice_channel.guild.voiceAdapterCreator,
                    selfDeaf: false,  
                    selfMute: false   
                });
                current_voice_connection.on(VoiceConnectionStatus.Ready, async () => {
                    logger.info(`Connected to ${voice_channel.name}`);
                    await sendWelcomeMessage(current_voice_connection);
                    await listenToUser(voice_channel.guild, invoking_user.user.username);
                });
                current_voice_connection.on(VoiceConnectionStatus.Disconnected, async () => {
                    await saveAndPostTranscription();
                    current_voice_connection.destroy();
                    current_voice_connection = null;
                    active_channel_id = null;
                });
            }
        }
    }
});

const sendWelcomeMessage = async (connection) => {
    const welcome_message = `Hi, I'm ${client.user.username}. How may I assist you today? Would you like to create a ticket, ask for some guidance, or have a question?`;
    console.log('Sending welcome message...');
    await textToSpeech(welcome_message, 'welcome_tts.mp3');

    if (!fs.existsSync('welcome_tts.mp3')) {
        console.error('TTS file was not created.');
        return;
    }

    const stats = fs.statSync('welcome_tts.mp3');
    if (stats.size === 0) {
        console.error('TTS file is empty.');
        return;
    } else {
        console.log(`TTS file size: ${stats.size} bytes`);
    }

    const player = createAudioPlayer();
    const resource = createAudioResource('welcome_tts.mp3');

    player.on(AudioPlayerStatus.Playing, () => {
        console.log('Audio player is playing.');
    });

    player.on(AudioPlayerStatus.Idle, () => {
        console.log('Audio player is idle.');
        player.stop();
        fs.unlinkSync('welcome_tts.mp3');
    });

    player.on('error', error => {
        console.error(`Error playing audio: ${error.message}`);
        fs.unlinkSync('welcome_tts.mp3');
    });

    connection.subscribe(player);
    player.play(resource);

    await new Promise(resolve => {
        player.on(AudioPlayerStatus.Idle, resolve);
    });
};

const listenToUser = async (guild, username) => {
    while (current_voice_connection) {
        console.log('Starting to record audio...');
        const audio_path = await recordAudio();
        console.log(`Audio recorded at: ${audio_path}`);
        if (audio_path) {
            const user_message = await transcribeAudioWithOpenAI(audio_path);
            console.log(`Transcribed text: ${user_message}`);
            if (user_message) {
                transcribed_text.push(`${username}: ${user_message}`);
                logger.info(`${username}: ${user_message}`);

                if (banned_words.some(banned_word => user_message.toLowerCase().includes(banned_word))) {
                    const response = "I'm sorry, but that kind of language is not allowed.";
                    await textToSpeech(response, 'response_tts.mp3');
                    transcribed_text.push(`${client.user.username}: ${response}`);
                    const player = createAudioPlayer();
                    const resource = createAudioResource('response_tts.mp3');
                    current_voice_connection.subscribe(player);
                    player.play(resource);
                    await new Promise(resolve => player.on(AudioPlayerStatus.Idle, resolve));
                    fs.unlinkSync('response_tts.mp3');
                    continue;
                }

                if (user_message.toLowerCase().includes("that's all")) {
                    await saveAndPostTranscription();
                    await current_voice_connection.destroy();
                    current_voice_connection = null;
                    logger.info("Disconnected from the voice channel as requested.");
                    return;
                }

                if (user_message.toLowerCase().includes("i need higher support") || user_message.toLowerCase().includes("create a ticket")) {
                    await gatherAdditionalInfo(guild, username);
                    await saveAndPostTranscription(true);
                    await sendGoodbyeMessage(current_voice_connection);
                    await current_voice_connection.destroy();
                    current_voice_connection = null;
                    logger.info("Disconnected from the voice channel after creating a ticket.");
                    return;
                }

                const response = await generateResponse(user_message, username, client.user.username, guild.name);
                transcribed_text.push(`${client.user.username}: ${response}`);
                const response_parts = splitResponse(response);

                for (const part of response_parts) {
                    await textToSpeech(part, 'response_tts.mp3');
                    const player = createAudioPlayer();
                    const resource = createAudioResource('response_tts.mp3');
                    current_voice_connection.subscribe(player);
                    player.play(resource);
                    await new Promise(resolve => player.on(AudioPlayerStatus.Idle, resolve));
                    fs.unlinkSync('response_tts.mp3');
                }
            }
        }
    }
};

const recordAudio = async () => {
    const temp_audio_file = tmp.fileSync({ postfix: '.pcm' });
    const temp_audio_path = temp_audio_file.name;
    const pcmFiles = [];

    const receiver = current_voice_connection.receiver;
    console.log(`Subscribing to the audio stream of user: ${invoking_user.id}`);
    const audioStream = receiver.subscribe(invoking_user.id, {
        end: {
            behavior: EndBehaviorType.Manual,
        },
    });

    const outputStream = fs.createWriteStream(temp_audio_path);

    audioStream.pipe(outputStream);

    return new Promise((resolve, reject) => {
        audioStream.on('data', chunk => {
            console.log(`Received audio chunk of size: ${chunk.length}`);
            pcmFiles.push(chunk);
        });

        outputStream.on('finish', async () => {
            const combinedPCMPath = tmp.fileSync({ postfix: '.pcm' }).name;
            const combinedPCMStream = fs.createWriteStream(combinedPCMPath);
            for (const chunk of pcmFiles) {
                combinedPCMStream.write(chunk);
            }
            combinedPCMStream.end();

            const wavPath = combinedPCMPath.replace('.pcm', '.wav');
            
            ffmpeg(combinedPCMPath)
                .inputFormat('s16le')
                .audioFrequency(48000)
                .audioChannels(2)
                .toFormat('wav')
                .on('error', (err) => {
                    console.error('Error recording audio:', err);
                    temp_audio_file.removeCallback();
                    reject(err);
                })
                .on('end', async () => {
                    console.log('Finished recording audio');
                    temp_audio_file.removeCallback();
                    const fileSize = fs.statSync(wavPath).size;
                    console.log(`Recorded file size: ${fileSize} bytes`);

                    if (fileSize < 30000) { 
                        const duration = 10; 
                        const silencePath = tmp.fileSync({ postfix: '.wav' }).name;
                        
                        ffmpeg()
                            .input('anullsrc=r=48000:cl=stereo')
                            .outputOptions(`-t ${duration}`)
                            .audioChannels(2)
                            .audioFrequency(48000)
                            .toFormat('wav')
                            .save(silencePath)
                            .on('end', () => {
                                console.log('Generated silence audio file');
                                
                                ffmpeg()
                                    .input(wavPath)
                                    .input(silencePath)
                                    .complexFilter('[0:0][1:0]concat=n=2:v=0:a=1[out]')
                                    .map('[out]')
                                    .on('end', () => {
                                        console.log('Padding with silence completed');
                                        resolve(wavPath);
                                    })
                                    .on('error', err => {
                                        console.error('Error padding with silence:', err);
                                        reject(err);
                                    })
                                    .save(wavPath);
                            });
                    } else {
                        resolve(wavPath);
                    }
                })
                .save(wavPath);
        });

        audioStream.on('error', reject);
        outputStream.on('error', reject);

        setTimeout(() => {
            outputStream.end();
        }, 5000); 
    });
};

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
            logger.error(`Failed to transcribe audio with status code: ${response.status}`);
            return null;
        }
    } catch (error) {
        logger.error(`Error in transcribeAudioWithOpenAI: ${error}`);
        return null;
    }
};

const splitResponse = (response, max_length = 200) => {
    const parts = [];
    while (response.length > max_length) {
        let split_at = response.lastIndexOf(' ', max_length);
        if (split_at === -1) split_at = max_length;
        parts.push(response.substring(0, split_at));
        response = response.substring(split_at).trim();
    }
    parts.push(response);
    return parts;
};

const gatherAdditionalInfo = async (guild, username) => {
    for (const question of follow_up_questions) {
        await textToSpeech(question, 'question_tts.mp3');
        const player = createAudioPlayer();
        const resource = createAudioResource('question_tts.mp3');
        current_voice_connection.subscribe(player);
        player.play(resource);
        await new Promise(resolve => player.on(AudioPlayerStatus.Idle, resolve));
        fs.unlinkSync('question_tts.mp3');

        const audio_path = await recordAudio();
        if (audio_path) {
            const user_message = await transcribeAudioWithOpenAI(audio_path);
            if (user_message) {
                transcribed_text.push(`${username}: ${user_message}`);
                logger.info(`${username}: ${user_message}`);
            }
            fs.unlinkSync(audio_path);
        }
    }
};

const saveAndPostTranscription = async (create_ticket = false) => {
    const transcription_file = 'transcription.txt';
    fs.writeFileSync(transcription_file, transcribed_text.join('\n'));

    const help_ticket_channel = client.channels.cache.get(HELP_TICKET_CHANNEL_ID);
    if (help_ticket_channel) {
        await help_ticket_channel.send({ content: 'Here is the transcription of the recent voice chat:', files: [new MessageAttachment(transcription_file)] });
        if (create_ticket) {
            await createSupportTicket(help_ticket_channel);
        }
    }
    transcribed_text = [];
};

const createSupportTicket = async (channel) => {
    const transcription = fs.readFileSync('transcription.txt', 'utf-8');
    const summary = await summarizeProblem(transcription);
    const embed = new EmbedBuilder()
        .setTitle('New Support Ticket')
        .setDescription(summary)
        .setColor('BLUE');
    const message = await channel.send({ embeds: [embed] });
    await message.react('✅');
    await message.react('🗑️');
};

const sendGoodbyeMessage = async (connection) => {
    const goodbye_message = "I'm sorry I couldn't help you today. A more senior support agent will contact you as soon as one is available. Have a good day, goodbye.";
    await textToSpeech(goodbye_message, 'goodbye_tts.mp3');
    const player = createAudioPlayer();
    const resource = createAudioResource('goodbye_tts.mp3');
    connection.subscribe(player);
    player.play(resource);
    await new Promise(resolve => player.on(AudioPlayerStatus.Idle, resolve));
    fs.unlinkSync('goodbye_tts.mp3');
};

client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;

    if (reaction.emoji.name === '✅' || reaction.emoji.name === '🗑️') {
        const message = await reaction.message.fetch();
        if (message.embeds.length > 0) {
            const embed = message.embeds[0];
            if (embed.title === 'New Support Ticket') {
                const member = await reaction.message.guild.members.fetch(user.id);
                if (member) {
                    if (reaction.emoji.name === '✅') {
                        const updated_embed = new EmbedBuilder(embed).addFields({ name: 'Claimed by', value: member.user.username, inline: true });
                        await message.edit({ embeds: [updated_embed] });
                    } else if (reaction.emoji.name === '🗑️' && member.permissions.has('ADMINISTRATOR')) {
                        await message.delete();
                    }
                }
            }
        }
    }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    if (current_voice_connection && active_channel_id) {
        if (newState.channelId === active_channel_id) {
            if (newState.member === invoking_user) {
                invoking_user = newState.member;
            }
        }

        if (oldState.channelId === active_channel_id) {
            if (oldState.channel.members.size === 1) {
                await saveAndPostTranscription();
                current_voice_connection.destroy();
                current_voice_connection = null;
                active_channel_id = null;
            }
        }
    }
});

sodium.ready.then(() => {
    client.login(DISCORD_BOT_TOKEN);
});
