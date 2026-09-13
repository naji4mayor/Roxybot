import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData } from '../../utils/economy.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { getSpinTypeLabel, getSpinTypes } from '../../config/ocSpin.js';

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
        const guildConfig = await getGuildConfig(client, interaction.guildId);
        const history = Array.isArray(userData.spinHistory) ? userData.spinHistory : [];

        const recentSpins = history.slice(-MAX_DISPLAYED_SPINS).reverse();
        const groupedSpins = recentSpins.reduce((groups, spin) => {
            const type = spin.spinType || 'other';
            if (!groups[type]) groups[type] = [];
            groups[type].push(spin);
            return groups;
        }, {});
        const allTypes = [...getSpinTypes(guildConfig), ...(groupedSpins.other ? ['other'] : [])];
        const fields = allTypes.slice(0, 25).map(type => {
            const spins = groupedSpins[type] || [];
            return {
                name: type === 'other' ? '✨ Other' : getSpinTypeLabel(guildConfig, type),
                value: spins.length === 0
                    ? '*No spins yet*'
                    : spins.map((spin, index) => {
                        const date = spin.spunAt ? `<t:${Math.floor(spin.spunAt / 1000)}:d>` : 'Unknown date';
                        return `**${index + 1}.** ${spin.itemName}\n> ${spin.rarity} · ${date}`;
                    }).join('\n'),
                inline: true,
            };
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: '🌸📖 Your Rebirth Record',
                description: `✦ **${interaction.user.displayName}**'s little collection of new lives ✦\n\nAll categories are shown below. Recent rolls: **${recentSpins.length}**.`,
                fields,
                color: '#7776E8',
            })
                .setThumbnail(interaction.user.displayAvatarURL({ extension: 'png', size: 128 }))
                .setFooter({ text: `✧ Showing ${recentSpins.length} of ${history.length} spins · Use /spin to begin again ✧` })],
        });
    }, { command: 'spins' }),
};