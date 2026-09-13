import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/config/guildConfig.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { SPIN_TABLES, SPIN_TYPE_LABELS, getSpinTable, normalizeSpinType, getSpinTypes } from '../../config/ocSpin.js';

function getTypeOption(option, required = true) {
    return option
        .setName('type')
        .setDescription('Category key, such as race or a custom category')
        .setRequired(required)
        .setMaxLength(32);
}

function getConfiguredTables(config) {
    return { ...(config.spinTables || {}) };
}

export default {
    data: new SlashCommandBuilder()
        .setName('spin-config')
        .setDescription('Customize the results and rarities for spin categories')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand => subcommand
            .setName('create')
            .setDescription('Create a new custom spin category')
            .addStringOption(option => option
                .setName('type')
                .setDescription('Unique category key')
                .setRequired(true)
                .setMaxLength(32))
            .addStringOption(option => option
                .setName('name')
                .setDescription('Display name for the category')
                .setRequired(true)
                .setMaxLength(32)))
        .addSubcommand(subcommand => subcommand
            .setName('add')
            .setDescription('Add a result with its rarity to a spin category')
            .addStringOption(getTypeOption)
            .addStringOption(option => option
                .setName('rarity')
                .setDescription('Rarity label, such as Common, Ancient, Mythic, or ???')
                .setRequired(true)
                .setMaxLength(32))
            .addStringOption(option => option
                .setName('result')
                .setDescription('The result users can spin')
                .setRequired(true)
                .setMaxLength(100)))
        .addSubcommand(subcommand => subcommand
            .setName('remove')
            .setDescription('Remove a result from a spin category')
            .addStringOption(getTypeOption)
            .addStringOption(option => option
                .setName('result')
                .setDescription('The exact result to remove')
                .setRequired(true)
                .setMaxLength(100)))
        .addSubcommand(subcommand => subcommand
            .setName('reset')
            .setDescription('Restore a category to the default results')
            .addStringOption(getTypeOption))
        .addSubcommand(subcommand => subcommand
            .setName('list')
            .setDescription('Show the current results and rarities')
            .addStringOption(getTypeOption))
        .addSubcommand(subcommand => subcommand
            .setName('rename')
            .setDescription('Change the display name of a spin category')
            .addStringOption(getTypeOption)
            .addStringOption(option => option
                .setName('name')
                .setDescription('The new display name')
                .setRequired(true)
                .setMaxLength(32))),
    category: 'Fun',

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            throw createError('Missing permission', ErrorTypes.PERMISSION, 'You need the **Manage Server** permission to customize spin categories.');
        }

        const guildConfig = await getGuildConfig(client, interaction.guildId);
        const type = normalizeSpinType(interaction.options.getString('type'));
        const subcommand = interaction.options.getSubcommand();
        const tables = getConfiguredTables(guildConfig);

        if (subcommand === 'create') {
            const name = interaction.options.getString('name').trim();
            if (!type || getSpinTypes(guildConfig).includes(type)) {
                throw createError('Category already exists', ErrorTypes.VALIDATION, `The **${type}** category already exists.`);
            }
            tables[type] = [];
            await setGuildConfig(client, interaction.guildId, {
                ...guildConfig,
                spinTables: tables,
                spinNames: { ...(guildConfig.spinNames || {}), [type]: name },
            });
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({ title: 'Spin Category Created', description: `Created **${name}**. Add results with **/spin-config add** using type **${type}**.`, color: '#2ECC71' })],
            });
            return;
        }

        if (!type || !getSpinTypes(guildConfig).includes(type)) {
            throw createError('Invalid spin type', ErrorTypes.VALIDATION, 'That spin category does not exist. Create it first with **/spin-config create**.');
        }

        if (subcommand === 'rename') {
            const name = interaction.options.getString('name').trim();
            const names = { ...(guildConfig.spinNames || {}), [type]: name };
            await setGuildConfig(client, interaction.guildId, { ...guildConfig, spinNames: names });
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({ title: 'Spin Name Updated', description: `The **${SPIN_TYPE_LABELS[type]}** category is now displayed as **${name}**.`, color: '#2ECC71' })],
            });
            return;
        }

        if (subcommand === 'add') {
            const rarity = interaction.options.getString('rarity').trim();
            const result = interaction.options.getString('result').trim();
            const table = [...getSpinTable(guildConfig, type)];
            table.push([rarity, result]);
            tables[type] = table;
            await setGuildConfig(client, interaction.guildId, { ...guildConfig, spinTables: tables });
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({ title: 'Spin Result Added', description: `Added **${result}** to **${SPIN_TYPE_LABELS[type]}** with rarity **${rarity}**.`, color: '#2ECC71' })],
            });
            return;
        }

        if (subcommand === 'remove') {
            const result = interaction.options.getString('result').trim();
            const table = [...getSpinTable(guildConfig, type)];
            const updated = table.filter(([, value]) => value.toLowerCase() !== result.toLowerCase());
            if (updated.length === table.length) {
                throw createError('Result not found', ErrorTypes.VALIDATION, `**${result}** is not in the **${SPIN_TYPE_LABELS[type]}** table.`);
            }
            if (updated.length === 0) {
                throw createError('Cannot empty category', ErrorTypes.VALIDATION, 'A spin category must have at least one result.');
            }
            tables[type] = updated;
            await setGuildConfig(client, interaction.guildId, { ...guildConfig, spinTables: tables });
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({ title: 'Spin Result Removed', description: `Removed **${result}** from **${SPIN_TYPE_LABELS[type]}**.`, color: '#E67E22' })],
            });
            return;
        }

        if (subcommand === 'reset') {
            delete tables[type];
            await setGuildConfig(client, interaction.guildId, { ...guildConfig, spinTables: tables });
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({ title: 'Spin Category Reset', description: `**${SPIN_TYPE_LABELS[type]}** is back to its default table.`, color: '#3498DB' })],
            });
            return;
        }

        const lines = getSpinTable(guildConfig, type).map(([rarity, result], index) => `**${index + 1}.** ${result} - **${rarity}**`);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({ title: `${SPIN_TYPE_LABELS[type]} Table`, description: lines.join('\n'), color: '#3498DB' })],
        });
    }, { command: 'spin-config' }),
};