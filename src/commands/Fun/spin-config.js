import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/config/guildConfig.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { normalizePoolName, RARITY_NAMES, getSpinItems } from '../../config/spin.js';

function getPools(config) {
    return { ...(config.spinPools || {}) };
}

function requirePoolName(value) {
    const poolName = normalizePoolName(value);
    if (!poolName || poolName.length > 32) {
        throw createError('Invalid pool name', ErrorTypes.VALIDATION, 'Pool names must be 1 to 32 letters, numbers, underscores, or hyphens.');
    }
    return poolName;
}

export default {
    data: new SlashCommandBuilder()
        .setName('spin-config')
        .setDescription('Configure custom spin reward pools')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand => subcommand
            .setName('create')
            .setDescription('Create a reward pool')
            .addStringOption(option => option.setName('pool').setDescription('Pool name').setRequired(true)))
        .addSubcommand(subcommand => subcommand
            .setName('add')
            .setDescription('Add or update a reward in a pool')
            .addStringOption(option => option.setName('pool').setDescription('Pool name').setRequired(true))
            .addStringOption(option => option.setName('item_id').setDescription('Unique item ID').setRequired(true))
            .addStringOption(option => option.setName('item_name').setDescription('Displayed reward name').setRequired(true))
            .addStringOption(option => option.setName('emoji').setDescription('Reward emoji').setRequired(true))
            .addStringOption(option => option
                .setName('rarity')
                .setDescription('Reward rarity')
                .setRequired(true)
                .addChoices(...RARITY_NAMES.map(name => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value: name }))))
            .addIntegerOption(option => option.setName('weight').setDescription('Relative chance weight').setRequired(true).setMinValue(1).setMaxValue(100000))
            .addIntegerOption(option => option.setName('value').setDescription('Displayed item value').setRequired(true).setMinValue(0).setMaxValue(2147483647)))
        .addSubcommand(subcommand => subcommand
            .setName('remove')
            .setDescription('Remove a reward from a pool')
            .addStringOption(option => option.setName('pool').setDescription('Pool name').setRequired(true))
            .addStringOption(option => option.setName('item_id').setDescription('Item ID to remove').setRequired(true)))
        .addSubcommand(subcommand => subcommand
            .setName('delete')
            .setDescription('Delete a custom reward pool')
            .addStringOption(option => option.setName('pool').setDescription('Pool name').setRequired(true)))
        .addSubcommand(subcommand => subcommand
            .setName('list')
            .setDescription('List pools and their rewards')),
    category: 'Fun',

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            throw createError('Missing permission', ErrorTypes.PERMISSION, 'You need the **Manage Server** permission to configure spin pools.');
        }

        const guildConfig = await getGuildConfig(client, interaction.guildId);
        const pools = getPools(guildConfig);
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'create') {
            const poolName = requirePoolName(interaction.options.getString('pool'));
            if (poolName === 'standard' || pools[poolName]) {
                throw createError('Pool already exists', ErrorTypes.VALIDATION, `The **${poolName}** pool already exists.`);
            }

            pools[poolName] = { items: [] };
            await setGuildConfig(client, interaction.guildId, { ...guildConfig, spinPools: pools });
            await InteractionHelper.safeEditReply(interaction, { embeds: [createEmbed({ title: 'Spin Pool Created', description: `Created **${poolName}**. Add rewards with **/spin-config add**.`, color: '#2ECC71' })] });
            return;
        }

        if (subcommand === 'add') {
            const poolName = requirePoolName(interaction.options.getString('pool'));
            const itemId = interaction.options.getString('item_id').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
            const item = {
                id: itemId,
                name: interaction.options.getString('item_name').trim(),
                emoji: interaction.options.getString('emoji').trim(),
                rarity: interaction.options.getString('rarity'),
                weight: interaction.options.getInteger('weight'),
                value: interaction.options.getInteger('value'),
            };

            if (!itemId || !item.name || !item.emoji) {
                throw createError('Invalid reward', ErrorTypes.VALIDATION, 'Item ID, name, and emoji are required.');
            }

            if (poolName === 'standard' && !pools[poolName]) {
                pools[poolName] = { items: getSpinItems(guildConfig, 'standard') };
            }

            if (!pools[poolName]) {
                throw createError('Pool not found', ErrorTypes.VALIDATION, `Create the **${poolName}** pool first with **/spin-config create**.`);
            }

            const items = pools[poolName].items || [];
            const existingIndex = items.findIndex(existing => existing.id === item.id);
            if (existingIndex >= 0) items[existingIndex] = item;
            else items.push(item);
            pools[poolName].items = items;
            await setGuildConfig(client, interaction.guildId, { ...guildConfig, spinPools: pools });
            await InteractionHelper.safeEditReply(interaction, { embeds: [createEmbed({ title: 'Spin Reward Saved', description: `**${item.name}** was saved in **${poolName}** as **${item.rarity}** with weight **${item.weight}**.`, color: '#2ECC71' })] });
            return;
        }

        if (subcommand === 'remove') {
            const poolName = requirePoolName(interaction.options.getString('pool'));
            if (!pools[poolName]) throw createError('Pool not found', ErrorTypes.VALIDATION, `The **${poolName}** pool does not exist.`);
            const itemId = interaction.options.getString('item_id');
            pools[poolName].items = (pools[poolName].items || []).filter(item => item.id !== itemId);
            await setGuildConfig(client, interaction.guildId, { ...guildConfig, spinPools: pools });
            await InteractionHelper.safeEditReply(interaction, { embeds: [createEmbed({ title: 'Spin Reward Removed', description: `Removed **${itemId}** from **${poolName}**.`, color: '#E67E22' })] });
            return;
        }

        if (subcommand === 'delete') {
            const poolName = requirePoolName(interaction.options.getString('pool'));
            if (poolName === 'standard') throw createError('Cannot delete standard pool', ErrorTypes.VALIDATION, 'The standard pool is built in and cannot be deleted.');
            delete pools[poolName];
            await setGuildConfig(client, interaction.guildId, { ...guildConfig, spinPools: pools });
            await InteractionHelper.safeEditReply(interaction, { embeds: [createEmbed({ title: 'Spin Pool Deleted', description: `Deleted **${poolName}**.`, color: '#E67E22' })] });
            return;
        }

        const poolNames = ['standard', ...Object.keys(pools).filter(name => name !== 'standard')];
        const lines = poolNames.map(poolName => {
            const items = getSpinItems(guildConfig, poolName);
            const summary = items.length ? items.map(item => `${item.emoji} ${item.name} (${item.rarity})`).join(', ') : 'No rewards configured';
            return `**${poolName}**: ${summary}`;
        });
        await InteractionHelper.safeEditReply(interaction, { embeds: [createEmbed({ title: 'Spin Pools', description: lines.join('\n') || 'No pools configured.', color: '#3498DB' })] });
    }, { command: 'spin-config' }),
};