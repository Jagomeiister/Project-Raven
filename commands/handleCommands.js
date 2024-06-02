const { joinVoiceChannel } = require('@discordjs/voice');

module.exports = (client, logger) => async (message) => {
    if (message.mentions.has(client.user)) {
        if (message.member.voice.channel) {
            const connection = joinVoiceChannel({
                channelId: message.member.voice.channel.id,
                guildId: message.member.voice.channel.guild.id,
                adapterCreator: message.member.voice.channel.guild.voiceAdapterCreator,
            });

            connection.on('ready', () => {
                logger.info('Connected to voice channel.');
                message.reply('Joined your voice channel!');
            });
        } else {
            message.reply('You need to join a voice channel first!');
        }
    }
};
