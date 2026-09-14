import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/config/guildConfig.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('responder-admin')
        .setDescription('Manage the responder personality settings')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addBooleanOption(option => option
            .setName('mature-mode')
            .setDescription('Enable non-explicit mature flirting in age-restricted channels')
            .setRequired(true)),
    category: 'Fun',

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            throw createError('Missing permission', ErrorTypes.PERMISSION, 'You need the **Manage Server** permission to change responder settings.');
        }

        const enabled = interaction.options.getBoolean('mature-mode');
        const guildConfig = await getGuildConfig(client, interaction.guildId);
        await setGuildConfig(client, interaction.guildId, {
            ...guildConfig,
            responderMatureMode: enabled,
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: enabled ? 'Mature Flirt Mode Enabled' : 'Mature Flirt Mode Disabled',
                description: enabled
                    ? 'The responder may use non-explicit cheeky replies when mentioned in age-restricted channels.'
                    : 'The responder will use her normal personality everywhere.',
                color: enabled ? '#C45A9A' : '#7776E8',
            })],
        });
    }, { command: 'responder-admin' }),
};