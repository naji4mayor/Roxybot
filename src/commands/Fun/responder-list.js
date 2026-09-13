import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { TSUNDERE_REPLIES, TSUNDERE_GIFS } from '../../events/messageCreate.js';

const CATEGORY_LABELS = {
    funny: 'Funny',
    flirty: 'Flirty',
    greeting: 'Greetings',
    help: 'Help',
    sad: 'Sad & Comforting',
    annoyed: 'Annoyed & Frustrated',
    identity: 'About Her',
    food: 'Favorite Food',
    favorites: 'Favorite Things',
    hobbies: 'Hobbies',
    music: 'Music',
    followup: 'Conversation Follow-ups',
    mood: 'Her Mood',
    compliment: 'Compliments',
    apology: 'Apologies',
    bored: 'Bored & Looking For Fun',
    excited: 'Excited',
    confused: 'Confused',
    goodbye: 'Goodbyes',
    roleplay: 'Roleplay',
    default: 'General Tsundere',
};

export default {
    data: new SlashCommandBuilder()
        .setName('responder-list')
        .setDescription('View the bot responder messages')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    category: 'Fun',

    execute: withErrorHandling(async (interaction) => {
        const deferred = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!deferred) return;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            throw createError(
                'Missing permission',
                ErrorTypes.PERMISSION,
                'You need the **Manage Server** permission to view responder messages.',
            );
        }

        const fields = Object.entries(TSUNDERE_REPLIES).map(([category, responses]) => ({
            name: CATEGORY_LABELS[category] || category,
            value: `${responses.map((response, index) => `**${index + 1}.** ${response}`).join('\n')}\n\n**GIFs:** ${(TSUNDERE_GIFS[category] || []).length}`,
            inline: false,
        }));

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: 'Tsundere Responder Messages',
                description: 'Admin-only list of the messages used when someone mentions the bot.',
                fields,
                color: '#7776E8',
            })],
        });
    }, { command: 'responder-list' }),
};