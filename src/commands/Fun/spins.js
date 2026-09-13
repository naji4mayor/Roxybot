import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const MAX_DISPLAYED_SPINS = 20;
const CATEGORY_LABELS = {
    race: '🌿 Race',
    rmage: '🔮 Mage Rank',
    manat: '💧 Mana Type',
    rsword: '⚔️ Sword Rank',
    clvl: '📈 Character Level',
    rank: '🏰 World Rank',
};

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
        const groupedSpins = recentSpins.reduce((groups, spin) => {
            const type = spin.spinType || 'other';
            if (!groups[type]) groups[type] = [];
            groups[type].push(spin);
            return groups;
        }, {});
        const fields = Object.entries(groupedSpins).map(([type, spins]) => ({
            name: CATEGORY_LABELS[type] || '✨ Other',
            value: spins.map((spin, index) => {
                const date = spin.spunAt ? `<t:${Math.floor(spin.spunAt / 1000)}:d>` : 'Unknown date';
                return `**${index + 1}.** ${spin.itemName}\n> ${spin.rarity} · ${date}`;
            }).join('\n'),
            inline: false,
        }));

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: '📖 Your Rebirth Record',
                description: 'Here are the paths your new lives have taken, grouped by spin category.',
                fields,
                color: '#3498DB',
            }).setFooter({ text: `Showing ${recentSpins.length} of ${history.length} spins · Use /spin to begin again.` })],
        });
    }, { command: 'spins' }),
};