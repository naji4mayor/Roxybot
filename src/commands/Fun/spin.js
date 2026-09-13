import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SPIN_COOLDOWN = 10 * 1000;
const MAX_PENDING_SPINS = 4;
const MAX_SPIN_HISTORY = 100;

const RARITIES = [
    { name: 'common', weight: 60, color: '#95A5A6' },
    { name: 'uncommon', weight: 25, color: '#2ECC71' },
    { name: 'rare', weight: 10, color: '#3498DB' },
    { name: 'epic', weight: 4, color: '#9B59B6' },
    { name: 'legendary', weight: 1, color: '#F1C40F' },
];

const SPIN_ITEMS = [
    { id: 'spin_pebble', name: 'Lucky Pebble', emoji: '🪨', rarity: 'common', value: 25 },
    { id: 'spin_sticker', name: 'Shiny Sticker', emoji: '✨', rarity: 'common', value: 50 },
    { id: 'spin_coin', name: 'Silver Coin', emoji: '🪙', rarity: 'uncommon', value: 125 },
    { id: 'spin_crystal', name: 'Blue Crystal', emoji: '🔷', rarity: 'rare', value: 350 },
    { id: 'spin_crown', name: 'Enchanted Crown', emoji: '👑', rarity: 'epic', value: 1000 },
    { id: 'spin_relic', name: 'Ancient Relic', emoji: '🏺', rarity: 'legendary', value: 5000 },
];

function chooseRarity() {
    const roll = Math.random() * 100;
    let threshold = 0;

    for (const rarity of RARITIES) {
        threshold += rarity.weight;
        if (roll < threshold) return rarity;
    }

    return RARITIES[RARITIES.length - 1];
}

function chooseItem(rarityName) {
    const items = SPIN_ITEMS.filter(item => item.rarity === rarityName);
    return items[Math.floor(Math.random() * items.length)];
}

function formatCooldown(ms) {
    return `${Math.ceil(ms / 1000)} second${Math.ceil(ms / 1000) === 1 ? '' : 's'}`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('spin')
        .setDescription('Spin for a random item with a weighted rarity'),
    category: 'Fun',

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();
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

        const rarity = chooseRarity();
        const item = chooseItem(rarity.name);
        const spinId = `${now}-${pendingSpins.length}`;
        const spinResult = {
            spinId,
            itemId: item.id,
            itemName: item.name,
            emoji: item.emoji,
            rarity: rarity.name,
            value: item.value,
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
            color: rarity.color,
        })
            .addFields({
                name: 'Rarity',
                value: rarity.name.charAt(0).toUpperCase() + rarity.name.slice(1),
                inline: true,
            }, {
                name: 'Pending',
                value: `${pendingSpins.length}/${MAX_PENDING_SPINS}`,
                inline: true,
            })
            .setFooter({ text: 'You can spin again in 10 seconds.' });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'spin' }),
};