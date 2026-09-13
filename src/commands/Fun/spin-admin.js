import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { getGuildConfig, setGuildConfig } from '../../services/config/guildConfig.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { SPIN_TYPE_LABELS } from '../../config/ocSpin.js';

const spinTypeChoices = Object.entries(SPIN_TYPE_LABELS).map(([value, name]) => ({ name, value }));

function addTypeOption(option) {
    return option
        .setName('type')
        .setDescription('Category to reset, or all categories if omitted')
        .setRequired(false)
        .addChoices(...spinTypeChoices);
}

export default {
    data: new SlashCommandBuilder()
        .setName('spin-admin')
        .setDescription('Manage user spin chances and daily limits')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand => subcommand
            .setName('reset')
            .setDescription('Restore a user\'s daily spin chances')
            .addUserOption(option => option
                .setName('user')
                .setDescription('The user whose chances should be restored')
                .setRequired(true))
            .addStringOption(addTypeOption))
        .addSubcommand(subcommand => subcommand
            .setName('bypass')
            .setDescription('Give or remove the daily spin limit bypass')
            .addUserOption(option => option
                .setName('user')
                .setDescription('The user to update')
                .setRequired(true))
            .addBooleanOption(option => option
                .setName('enabled')
                .setDescription('Whether this user should have no daily limit')
                .setRequired(true))),
    category: 'Fun',

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            throw createError('Missing permission', ErrorTypes.PERMISSION, 'You need the **Manage Server** permission to manage spin limits.');
        }

        const subcommand = interaction.options.getSubcommand();
        const target = interaction.options.getUser('user');
        const guildId = interaction.guildId;

        if (subcommand === 'reset') {
            const type = interaction.options.getString('type');
            const userData = await getEconomyData(client, guildId, target.id);
            const today = new Date().toISOString().slice(0, 10);
            const counts = userData.spinUsage?.date === today ? { ...(userData.spinUsage.counts || {}) } : {};

            if (type) delete counts[type];
            else Object.keys(SPIN_TYPE_LABELS).forEach(category => delete counts[category]);

            userData.spinUsage = { date: today, counts };
            await setEconomyData(client, guildId, target.id, userData);
            const scope = type ? SPIN_TYPE_LABELS[type] : 'all spin categories';
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({ title: 'Spin Chances Reset', description: `Reset **${scope}** for ${target}.`, color: '#2ECC71' })],
            });
            return;
        }

        const enabled = interaction.options.getBoolean('enabled');
        const guildConfig = await getGuildConfig(client, guildId);
        const exemptUsers = new Set(Array.isArray(guildConfig.spinLimitExemptUsers) ? guildConfig.spinLimitExemptUsers : []);

        if (enabled) exemptUsers.add(target.id);
        else exemptUsers.delete(target.id);

        await setGuildConfig(client, guildId, {
            ...guildConfig,
            spinLimitExemptUsers: [...exemptUsers],
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: enabled ? 'Spin Limit Bypass Enabled' : 'Spin Limit Bypass Removed',
                description: `${target} ${enabled ? 'can now spin without the daily category limit' : 'is now subject to the daily category limit'}.`,
                color: enabled ? '#2ECC71' : '#E67E22',
            })],
        });
    }, { command: 'spin-admin' }),
};