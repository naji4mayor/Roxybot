import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/config/guildConfig.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const RARITY_CHOICES = [
    ['common', 'Common'],
    ['uncommon', 'Uncommon'],
    ['rare', 'Rare'],
    ['epic', 'Epic'],
    ['legendary', 'Legendary'],
];

export default {
    data: new SlashCommandBuilder()
        .setName('spin-config')
        .setDescription('Configure roles awarded by the spin system')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand => subcommand
            .setName('set')
            .setDescription('Set the role for a rarity')
            .addStringOption(option => option
                .setName('rarity')
                .setDescription('The rarity to configure')
                .setRequired(true)
                .addChoices(...RARITY_CHOICES.map(([value, name]) => ({ name, value }))))
            .addRoleOption(option => option
                .setName('role')
                .setDescription('The role awarded for this rarity')
                .setRequired(true)))
        .addSubcommand(subcommand => subcommand
            .setName('remove')
            .setDescription('Remove a rarity role')
            .addStringOption(option => option
                .setName('rarity')
                .setDescription('The rarity to clear')
                .setRequired(true)
                .addChoices(...RARITY_CHOICES.map(([value, name]) => ({ name, value })))))
        .addSubcommand(subcommand => subcommand
            .setName('list')
            .setDescription('List configured rarity roles')),
    category: 'Fun',

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            throw createError('Missing permission', ErrorTypes.PERMISSION, 'You need the **Manage Server** permission to configure spins.');
        }

        const guildConfig = await getGuildConfig(client, interaction.guildId);
        const spinRoles = { ...(guildConfig.spinRoles || {}) };
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'set') {
            const rarity = interaction.options.getString('rarity');
            const role = interaction.options.getRole('role');

            if (role.managed || role.position >= interaction.guild.members.me.roles.highest.position) {
                throw createError('Invalid role', ErrorTypes.PERMISSION, 'I cannot assign that role. It must be below my highest role and not managed by an integration.');
            }

            spinRoles[rarity] = role.id;
            await setGuildConfig(client, interaction.guildId, { ...guildConfig, spinRoles });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({ title: 'Spin Role Updated', description: `**${rarity}** spins now award ${role}.`, color: '#2ECC71' })],
            });
            return;
        }

        if (subcommand === 'remove') {
            const rarity = interaction.options.getString('rarity');
            delete spinRoles[rarity];
            await setGuildConfig(client, interaction.guildId, { ...guildConfig, spinRoles });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({ title: 'Spin Role Removed', description: `No role is configured for **${rarity}** spins.`, color: '#E67E22' })],
            });
            return;
        }

        const lines = RARITY_CHOICES.map(([rarity, name]) => {
            const role = spinRoles[rarity] ? interaction.guild.roles.cache.get(spinRoles[rarity]) : null;
            return `**${name}:** ${role || 'Not configured'}`;
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({ title: 'Spin Role Configuration', description: lines.join('\n'), color: '#3498DB' })],
        });
    }, { command: 'spin-config' }),
};