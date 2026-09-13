import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('claim')
        .setDescription('Claim all pending spin items'),
    category: 'Fun',

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const userData = await getEconomyData(client, guildId, userId);
        const pendingSpins = Array.isArray(userData.pendingSpins) ? userData.pendingSpins : [];

        if (pendingSpins.length === 0) {
            throw createError(
                'No pending spins',
                ErrorTypes.VALIDATION,
                'You do not have any pending spin rewards to claim.',
            );
        }

        const claimed = [];
        userData.inventory = userData.inventory || {};

        for (const reward of pendingSpins) {
            userData.inventory[reward.itemId] = (userData.inventory[reward.itemId] || 0) + 1;
            const historyEntry = userData.spinHistory?.find(entry => entry.spinId === reward.spinId);
            if (historyEntry) historyEntry.claimed = true;
            claimed.push(`${reward.emoji || ''} **${reward.itemName}** (${reward.rarity})`);
        }

        userData.pendingSpins = [];
        await setEconomyData(client, guildId, userId, userData);

        const description = `Added ${claimed.length} item${claimed.length === 1 ? '' : 's'} to your inventory:\n${claimed.join('\n')}`;

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: 'Spin Items Claimed',
                description,
                color: '#2ECC71',
            })],
        });
    }, { command: 'claim' }),
};