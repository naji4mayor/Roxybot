import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { getSpinItems, RARITY_COLORS } from '../../config/spin.js';

const SPIN_COOLDOWN = 10 * 1000;
const MAX_PENDING_SPINS = 4;
const MAX_SPIN_HISTORY = 100;

function chooseItem(items) {
    const totalWeight = items.reduce((total, item) => total + Number(item.weight || 0), 0);
    const roll = Math.random() * totalWeight;
    let threshold = 0;

    for (const item of items) {
        threshold += Number(item.weight || 0);
        if (roll < threshold) return item;
    }

    return items[items.length - 1];
}

function formatCooldown(ms) {
    return `${Math.ceil(ms / 1000)} second${Math.ceil(ms / 1000) === 1 ? '' : 's'}`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('spin')
        .setDescription('Spin for a random item with a weighted rarity')
        .addStringOption(option => option
            .setName('pool')
            .setDescription('The reward pool to spin')
            .setRequired(false)),
    category: 'Fun',

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();
        const poolName = interaction.options.getString('pool') || 'standard';
        const guildConfig = await getGuildConfig(client, guildId);
        const poolItems = getSpinItems(guildConfig, poolName);

        if (poolItems.length === 0) {
            throw createError(
                'Spin pool not found',
                ErrorTypes.VALIDATION,
                `The **${poolName}** spin pool does not exist or has no rewards.`,
                { poolName },
            );
        }

        const userData = await getEconomyData(client, guildId, userId);
        const lastSpin = userData.lastSpin || 0;
        const remaining = lastSpin + SPIN_COOLDOWN - now;
        const pendingSpins = Array.isArray(userData.pendingSpins) ? userData.pendingSpins : [];

        if (pendingSpins.length >= MAX_PENDING_SPINS) {
            throw createError(
                'Spin limit reached',
                ErrorTypes.RATE_LIMIT,
                'You have **4 pending spins**. Use `/claim` before spinning again.',
                { limit: MAX_PENDING_SPINS },
            );
        }

        if (remaining > 0) {
            throw createError(
                'Spin cooldown active',
                ErrorTypes.RATE_LIMIT,
                `You need to wait **${formatCooldown(remaining)}** before spinning again.`,
                { remaining, cooldownType: 'spin' },
            );
        }

        const item = chooseItem(poolItems);
        const rarity = item.rarity || 'common';
        const spinId = `${now}-${pendingSpins.length}`;
        const spinResult = {
            spinId,
            itemId: item.id,
            itemName: item.name,
            emoji: item.emoji,
            rarity,
            value: item.value,
            pool: poolName,
            spunAt: now,
            claimed: false,
        };

        pendingSpins.push(spinResult);
        userData.pendingSpins = pendingSpins;
        userData.spinHistory = [
            ...(Array.isArray(userData.spinHistory) ? userData.spinHistory : []),
            spinResult,
        ].slice(-MAX_SPIN_HISTORY);
        userData.lastSpin = now;

        await setEconomyData(client, guildId, userId, userData);

        const embed = createEmbed({
            title: 'Spin Result',
            description: `The wheel stopped on **${item.emoji} ${item.name}**!\n\nYour item is pending. Use **/claim** to add it to your inventory.\nPending spins: **${pendingSpins.length}/${MAX_PENDING_SPINS}**`,
            color: RARITY_COLORS[rarity] || RARITY_COLORS.common,
        })
            .addFields({
                name: 'Rarity',
                value: rarity.charAt(0).toUpperCase() + rarity.slice(1),
                inline: true,
            }, {
                name: 'Pending',
                value: `${pendingSpins.length}/${MAX_PENDING_SPINS}`,
                inline: true,
            })
            .setFooter({ text: `Pool: ${poolName} | You can spin again in 10 seconds.` });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'spin' }),
};