import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { chooseSpinResult, SPIN_RARITY_COLORS, SPIN_TYPE_LABELS } from '../../config/ocSpin.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';

const SPIN_COOLDOWN = 10 * 1000;
const MAX_SPIN_HISTORY = 100;
const MAX_DAILY_SPINS_PER_TYPE = 3;

function formatCooldown(ms) {
    return `${Math.ceil(ms / 1000)} second${Math.ceil(ms / 1000) === 1 ? '' : 's'}`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('spin')
        .setDescription('Spin for a race, rank, mana type, or mage level')
        .addStringOption(option => option
            .setName('type')
            .setDescription('What kind of result to spin for')
            .setRequired(true)
            .addChoices(
                { name: 'Race', value: 'race' },
                { name: 'Mage Rank', value: 'rmage' },
                { name: 'Mana Type', value: 'manat' },
                { name: 'Sword Rank', value: 'rsword' },
                { name: 'Character Level', value: 'clvl' },
                { name: 'World Rank', value: 'rank' },
            )),
    category: 'Fun',

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();
        const spinType = interaction.options.getString('type');

        const userData = await getEconomyData(client, guildId, userId);
        const guildConfig = await getGuildConfig(client, guildId);
        const lastSpin = userData.lastSpin || 0;
        const remaining = lastSpin + SPIN_COOLDOWN - now;
        const today = new Date(now).toISOString().slice(0, 10);
        const spinUsage = userData.spinUsage?.date === today
            ? userData.spinUsage
            : { date: today, counts: {} };
        const spinsUsed = spinUsage.counts?.[spinType] || 0;

        const isLimitExempt = Array.isArray(guildConfig.spinLimitExemptUsers)
            && guildConfig.spinLimitExemptUsers.includes(userId);

        if (!isLimitExempt && spinsUsed >= MAX_DAILY_SPINS_PER_TYPE) {
            throw createError(
                'Daily spin limit reached',
                ErrorTypes.RATE_LIMIT,
                `You have used all **${MAX_DAILY_SPINS_PER_TYPE} ${SPIN_TYPE_LABELS[spinType]}** spins for today. Try again tomorrow.`,
                { spinType, limit: MAX_DAILY_SPINS_PER_TYPE },
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

        const result = chooseSpinResult(spinType, guildConfig);
        const spinId = `${now}-${userId}`;
        const spinResult = {
            spinId,
            itemId: `${spinType}_${spinId}`,
            itemName: result.result,
            rarity: result.rarity,
            spinType,
            spunAt: now,
        };

        userData.spinHistory = [
            ...(Array.isArray(userData.spinHistory) ? userData.spinHistory : []),
            spinResult,
        ].slice(-MAX_SPIN_HISTORY);
        userData.lastSpin = now;
        spinUsage.counts = { ...(spinUsage.counts || {}), [spinType]: spinsUsed + 1 };
        userData.spinUsage = spinUsage;

        await setEconomyData(client, guildId, userId, userData);

        const embed = createEmbed({
            title: '🌸✨ A New World Awaits ✨🌸',
            description: `A warm little light gathers around you...\n\nWhen it fades, you awaken as **${result.result}**.\n\n**Rarity:** ${result.rarity}\n**Path:** ${SPIN_TYPE_LABELS[spinType]}\n\nUse **/spin-history** to revisit your new life.`,
            color: SPIN_RARITY_COLORS[result.rarity] || SPIN_RARITY_COLORS.Common,
        })
            .addFields({
                name: '✨ Your New Fate',
                value: result.rarity,
                inline: true,
            }, {
                name: '🌙 Rebirth Path',
                value: isLimitExempt
                    ? `${SPIN_TYPE_LABELS[spinType]} (No daily limit)`
                    : `${SPIN_TYPE_LABELS[spinType]} (${spinsUsed + 1}/${MAX_DAILY_SPINS_PER_TYPE} today)`,
                inline: true,
            })
            .setFooter({ text: 'May your second life be wonderfully strange ✦ Spin cooldown: 10 seconds' });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'spin' }),
};