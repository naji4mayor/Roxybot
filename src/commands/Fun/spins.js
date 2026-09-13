import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const MAX_DISPLAYED_SPINS = 20;

export default {
    data: new SlashCommandBuilder()
        .setName('spin-history')
        .setDescription('Show your spin history'),
    category: 'Fun',

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userData = await getEconomyData(client, interaction.guildId, interaction.user.id);
        const history = Array.isArray(userData.spinHistory) ? userData.spinHistory : [];

        if (history.length === 0) {
            throw createError(
                'No spin history',
                ErrorTypes.VALIDATION,
                'You have not spun anything yet. Use `/spin` to get started.',
            );
        }

        const recentSpins = history.slice(-MAX_DISPLAYED_SPINS).reverse();
        const description = recentSpins.map((spin, index) => {
            const type = spin.spinType ? ` · ${spin.spinType}` : '';
            return `**${index + 1}.** **${spin.itemName}** · ${spin.rarity}${type}`;
        }).join('\n');

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: 'What You Have Spun',
                description,
                color: '#3498DB',
            }).setFooter({ text: `Showing ${recentSpins.length} of ${history.length} spins.` })],
        });
    }, { command: 'spins' }),
};