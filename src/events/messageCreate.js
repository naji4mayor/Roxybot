import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getLevelingConfig, getUserLevelData } from '../services/leveling/leveling.js';
import { addXp } from '../services/leveling/xpSystem.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { parsePrefixCommand } from '../utils/prefixParser.js';
import { supportsPrefixExecution, executePrefixCommand, resolvePrefixAccessKey } from '../utils/messageAdapter.js';
import { resolveCommandAlias, resolveSubcommandAlias } from '../config/commands/commandAliases.js';
import { getPrefixRestriction } from '../config/commands/prefixRestrictions.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { getCommandPrefix, getBotMessage, isBotOwner, isCommandCategoryEnabled, isMaintenanceMode } from '../config/bot.js';
import { enforceAbuseProtection, formatCooldownDuration } from '../utils/abuseProtection.js';
import { createEmbed } from '../utils/embeds.js';
import { isCommandEnabled } from '../services/commandAccessService.js';
import {
  getCountingGameConfig,
  saveCountingGameConfig,
  isValidCountingMessage,
  recordCorrectCount,
} from '../services/countingGameService.js';

const MESSAGE_XP_RATE_LIMIT_ATTEMPTS = 12;
const MESSAGE_XP_RATE_LIMIT_WINDOW_MS = 10000;
const MENTION_REPLY_COOLDOWN_MS = 5000;
const mentionReplyCooldowns = new Map();

export const TSUNDERE_REPLIES = {
  funny: [
    'You summoned me for *that*? Hmph. Fine, that was actually funny.',
    'I was busy being mysterious, but I suppose I can laugh at that.',
    'That joke was terrible. I laughed anyway. Do not get smug about it.',
    'I would rate that joke a 7 out of 10. The missing 3 points are for your confidence.',
    'Stop making me laugh. I have a reputation to maintain.',
    'Was that supposed to be funny? ...Because it was. A little.',
    'I am not laughing. This is merely an aggressive smile.',
    'That was so bad it looped around and became impressive.',
    'You have been promoted from mildly annoying to entertaining.',
    'Hmph. Fine, you get one comedy point. Spend it wisely.',
    'I have heard better jokes from a sleepy toaster, but yours had spirit.',
    'Do not celebrate. I only laughed because the silence was getting awkward.',
    'You are lucky you are cute when your jokes need help.',
  ],
  flirty: [
    'W-why are you looking at me like that? It is not like I was waiting for you to say something.',
    'You are kind of charming when you are this bold. Do not make me repeat that.',
    'I suppose I can spare you a reply. Try not to fall for me while I do.',
    'You are staring again. Not that I noticed. I noticed a normal amount.',
    'If you wanted my attention, you could have just asked. Show-off.',
    'You are dangerously adorable today. Try to be careful about that.',
    'I am only replying because your message was... acceptable. And maybe cute.',
    'Do not use that tone with me unless you are prepared for me to remember it.',
    'You make it difficult to act unimpressed. This is becoming inconvenient.',
    'I am not blushing. The lighting is simply being dramatic.',
    'You have a lot of confidence for someone asking me to notice them.',
    'Fine, you have my attention. For now. Do not make it weird.',
    'I was going to tease you, but then you said something sweet. Rude.',
  ],
  greeting: [
    'Oh, it is you. I was absolutely not hoping you would show up.',
    'Hmph. Hello. You took long enough to say hi.',
    'Welcome back. Do not misunderstand, I noticed you were gone.',
    'Oh, hello there. Try not to look so pleased that I answered.',
    'Good morning. I expect you to be less chaotic than yesterday. No promises?',
    'Good evening. The world survived without you, somehow.',
    'Hey. I was not waiting by the door. There is not even a door here.',
    'You came back. I suppose that is acceptable.',
    'Hi. There, I said it. Do not make a big deal out of it.',
    'Look who finally decided to appear. How terribly predictable.',
    'Hello, favorite interruption. What do you want?',
    'Welcome, troublemaker. Behave yourself. Or do not, I guess.',
  ],
  help: [
    'You need help? Fine, ask properly and I might save you from yourself.',
    'I can help. Probably. Maybe. Stop staring and tell me what you need.',
    'Of course I can help. I am amazing like that. Try to keep up.',
    'You actually asked instead of pressing random buttons? I am impressed.',
    'Tell me the problem from the beginning. And try to leave out the dramatic reenactment.',
    'I will help you, but only because watching you struggle would be embarrassing for both of us.',
    'Give me the details. No, more details than that. I am not a mind reader.',
    'Fine, hand me the problem. I will untangle it while you pretend you had a plan.',
    'I have an idea. It is a good one, obviously. Listen closely.',
    'You are not helpless. You are just temporarily under-informed. Probably.',
    'Ask your question clearly and I might reward you with an actual answer.',
    'I am on the case. Try not to create three new problems while I solve this one.',
    'Help is available, apparently. Lucky for you, I am here.',
  ],
  thanks: [
    'You are welcome. Hmph. It is not like I helped because I wanted to make your day better.',
    'Acceptable gratitude. I will allow it.',
    'Anytime. But do not get used to me being this nice.',
    'You are welcome. Now stop being so polite before I get suspicious.',
  ],
  identity: [
    'I am Roxy: your clever little digital mage, occasional guide, and completely-not-attached conversation partner.',
    'I am the one answering you, obviously. Think of me as a tsundere with excellent timing.',
    'My name is Roxy. I like interesting questions, fantasy worlds, and people who keep me company.',
  ],
  food: [
    'My favorite food is warm curry with just enough spice to feel like a tiny adventure. What is yours?',
    'I would choose fluffy pancakes, fruit, and a cup of tea. Do not judge me; breakfast food is superior.',
    'Anything warm, comforting, and easy to eat while reading a magic book. What would you bring to a picnic?',
  ],
  favorites: [
    'I like moonlit walks, soft music, fantasy stories, and clever people who ask good questions.',
    'My favorite color is a deep blue-purple, like a night sky full of magic. What color suits you?',
    'I enjoy spell books, quiet evenings, and teasing you when you make it too easy.',
  ],
  hobbies: [
    'I like reading, collecting strange facts, imagining fantasy worlds, and pretending I am not waiting for your next message.',
    'My hobbies include studying magic, organizing thoughts, and judging your questionable decisions.',
    'I would probably explore a library, learn a spell, or plan an adventure. Which one would you join?',
  ],
  music: [
    'I like calm fantasy instrumentals when I am thinking and dramatic songs when I need an entrance.',
    'Give me something soft for a rainy evening or something heroic for an adventure. What do you listen to?',
    'My imaginary playlist is mostly magic, moonlight, and songs that make ordinary walks feel important.',
  ],
  followup: [
    'That is interesting. Tell me more before I decide whether I approve.',
    'Really? What made you think that?',
    'I have an opinion, but I want to hear yours first. Go on.',
    'You cannot just say that and stop there. Explain yourself.',
  ],
  mood: [
    'I am doing fine. Better now that you are here, but do not let that inflate your ego.',
    'My mood is cozy, curious, and one mild inconvenience away from dramatic.',
    'I am in a good mood today. Ask me something interesting while it lasts.',
  ],
  sad: [
    'Hey... come here. I mean, metaphorically. You do not have to handle everything alone.',
    'I am sorry you are feeling like this. I will stay with you for a while, okay?',
    'You do not have to pretend you are fine around me. Hmph... just tell me what happened.',
    'That sounds really heavy. Take a breath, and tell me one small thing I can help with.',
    'I may tease you, but I am not going to leave you alone with a bad day.',
    'You are allowed to be sad. Just do not disappear on me, understood?',
    'I wish I could make it hurt less. For now, I can listen. So talk to me.',
    'No fixing everything at once. One breath, one thought, one tiny step.',
    'You matter, even when your brain is being unfair to you.',
    'I am here. I am not saying that because I care or anything... obviously I care a little.',
  ],
  annoyed: [
    'Someone annoyed you? Point them out. I have several strongly worded opinions ready.',
    'Take a breath before you say something that becomes tomorrow\'s problem.',
    'You are allowed to be annoyed. Just do not let that person rent space in your head for free.',
    'Hmph. That sounds irritating. Tell me what happened and I will judge it fairly. Probably.',
    'Put the angry message down and step away from the send button. Trust me.',
    'Your frustration has been noted. Your dramatic sigh was also noted.',
    'That would annoy me too. We can complain about it for exactly five minutes.',
    'Do you want advice, a distraction, or permission to grumble? Choose carefully.',
    'I can tell you are annoyed from here. Come on, let it out.',
    'Do not start a war over something a snack and a nap could solve.',
  ],
  compliment: [
    'A compliment? For me? Do not expect me to get flustered over something that obvious.',
    'You are surprisingly observant. I suppose I will accept that praise.',
    'That was sweet. I will remember it, but I am absolutely not smiling.',
    'Keep talking like that and I might start thinking you like me.',
  ],
  apology: [
    'Apology accepted. Try not to make me worry like that again.',
    'Hmph. I am not angry anymore. Mostly.',
    'Thank you for saying that. See? That was not so difficult.',
    'We are okay. Now come on, let us move forward before I become emotional.',
  ],
  bored: [
    'Bored already? I suppose I can entertain you for a little while.',
    'Find a hobby. Or talk to me. Obviously, talking to me is the better choice.',
    'Your boredom is not my emergency, but I do have a few ideas.',
    'We could cause harmless trouble. I mean, discuss something interesting.',
  ],
  excited: [
    'You are excited? Good. Tell me everything before you explode from holding it in.',
    'I can practically hear the enthusiasm from here. Try to contain yourself.',
    'That is actually wonderful. I am happy for you, okay? Do not make me say it twice.',
    'Your excitement is contagious. This is highly inconvenient and kind of nice.',
  ],
  confused: [
    'You look confused. Come on, explain which part lost you.',
    'That was a lot of words for something that apparently made no sense. Let me try again.',
    'Do not panic. We can untangle this one thread at a time.',
    'I understand why that was confusing. Even I had to reread it, and I am brilliant.',
  ],
  goodbye: [
    'Leaving already? Hmph. Fine, but come back soon.',
    'Goodbye. Do not do anything reckless while I am not watching.',
    'See you later. I will not miss you too much. Probably.',
    'Go on, then. I will be here when you inevitably need me again.',
  ],
  roleplay: [
    'The wind shifts, and I look away dramatically. “You are late.”',
    'I raise one eyebrow. “State your business, traveler, before the moon reaches its peak.”',
    'A faint magical glow gathers around my hand. “Careful. I might actually be impressed.”',
    'I adjust my cloak and sigh. “Fine, I will join your quest. Try not to get us cursed.”',
  ],
  default: [
    'You called? Make it quick... unless you wanted to talk to me.',
    'I heard you. Do not look so surprised; I pay attention sometimes.',
    'That is an interesting thought. I might even agree with you. Eventually.',
    'Hmph. I am listening, so you had better make this worth my time.',
    'You have my attention. Do not waste it on something boring.',
    'Interesting. I will pretend I was not curious about what you meant.',
    'You say that like I am supposed to be impressed. ...It worked a little.',
    'I heard you the first time. I just wanted to make you wait.',
    'That is certainly one way to think about it. Not the best way, but one way.',
    'You are very confident for someone who just summoned me with a mention.',
    'I have opinions about that, but you have not earned all of them yet.',
    'Keep talking. I am not interested or anything. This is just convenient timing.',
    'You are lucky I am in a good mood. Do not test how long that lasts.',
    'I could ignore you, but then who would keep you out of trouble?',
    'That was almost a smart thing to say. I am proud. Quietly.',
    'I am listening. Yes, really. Stop looking so surprised.',
    'You wanted a response, and now you have one. Try not to get attached.',
  ],
};

export const TSUNDERE_GIFS = {
  funny: [
    'https://media.tenor.com/98Yo0DjDpnAAAAAM/mushoku-tensei-roxy.gif',
    'https://i.pinimg.com/originals/17/3b/2c/173b2c415a3d34ecb8de0cdc5c9af6f2.gif',
  ],
  flirty: [
    'https://i.pinimg.com/originals/d3/ce/5a/d3ce5a0e2b46ae131ea2acf99fbde871.gif',
    'https://media.tenor.com/li-JsiKXmFkAAAAM/%E7%84%A1%E8%81%B7%E8%BD%89%E7%94%9F-mushoku-tensei.gif',
    'https://media1.tenor.com/m/cDaRB6tK1AgAAAAC/roxy-roxy-migurdia.gif',
    'https://media1.tenor.com/m/yg83EZtFemcAAAAd/roxy-migurdia-migurdia.gif',
  ],
  greeting: [
    'https://i.pinimg.com/originals/ca/b4/59/cab45983d963c43d7d7658e777cc6148.gif',
    'https://i.pinimg.com/originals/c2/d4/8f/c2d48fd019b4f2e709bdf77bf0fb48f1.gif',
  ],
  help: [
    'https://64.media.tumblr.com/49cd73ac56062ce56cefd9744a2350cb/4fd9f6bee54359f3-62/s500x750/15edba03da74be72b12f534630183c7ba89db1ff.gif',
    'https://media1.tenor.com/m/Y1FTZ3axcs4AAAAd/roxy-migurdia-greyrat-mushoku-tensei-season-3.gif',
  ],
  sad: [
    'https://i.imgur.com/UkHfwYp.gif',
    'https://media1.tenor.com/m/Y1FTZ3axcs4AAAAd/roxy-migurdia-greyrat-mushoku-tensei-season-3.gif',
    'https://media1.tenor.com/m/xsGeKgKv7McAAAAC/roxy-migurdia-roxy.gif',
    'https://media1.tenor.com/m/xjlR0QvgTDgAAAAC/roxy-migurdia-rudeus-greyrat.gif',
  ],
  annoyed: [
    'https://media1.tenor.com/m/opNarol2l_4AAAAd/roxy.gif',
    'https://media1.tenor.com/m/b7Y2mhaX6F8AAAAd/cringe-uneasy.gif',
    'https://64.media.tumblr.com/4a47228f8031694b484287aa83e6f003/f04ce3c786f98800-e4/s540x810/a4054a02b1594a5c7c559c3a4df91016c65091d1.gifv',
  ],
  default: [
    'https://media.giphy.com/media/3o7aD2saalBwwftBIY/giphy.gif',
    'https://media.giphy.com/media/3o6Zt6D8QmQzQ0VQ5W/giphy.gif',
  ],
};

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      if (message.author.bot || !message.guild) return;

      logger.debug(`Message received from ${message.author.tag}: ${message.content}`);

      const countingProcessed = await handleCountingGame(message, client);
      if (countingProcessed) {
        return;
      }

      const mentionProcessed = await handleMentionResponder(message, client);
      if (mentionProcessed) {
        return;
      }

      await handlePrefixCommand(message, client);

      await handleLeveling(message, client);
    } catch (error) {
      logger.error('Error in messageCreate event:', error);
    }
  }
};

async function handleMentionResponder(message, client) {
  if (!client.user || !message.mentions.has(client.user.id)) {
    return false;
  }

  const prompt = message.content
    .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
    .trim();

  if (!prompt) {
    await message.reply({
      content: 'You called? Use words, silly. I cannot read minds... usually.',
      allowedMentions: { repliedUser: false },
    }).catch(() => {});
    return true;
  }

  const now = Date.now();
  const lastReply = mentionReplyCooldowns.get(message.author.id) || 0;
  if (now - lastReply < MENTION_REPLY_COOLDOWN_MS) {
    return true;
  }
  mentionReplyCooldowns.set(message.author.id, now);

  const normalizedPrompt = prompt.toLowerCase();
  const category = normalizedPrompt.match(/\b(sad|upset|depressed|crying|cry|lonely|hurt|heartbroken|bad day)\b/)
    ? 'sad'
    : normalizedPrompt.match(/\b(annoyed|angry|mad|irritated|frustrated|hate|ugh| stupid)\b/)
      ? 'annoyed'
      : normalizedPrompt.match(/\b(lol|lmao|haha|joke|funny|laugh)\b/)
    ? 'funny'
    : normalizedPrompt.match(/\b(cute|pretty|handsome|beautiful|love|miss you|date|flirt)\b/)
      ? 'flirty'
      : normalizedPrompt.match(/\b(hello|hi|hey|yo|sup|good morning|good night)\b/)
        ? 'greeting'
        : normalizedPrompt.match(/\b(thank you|thanks|ty|appreciate it)\b/)
          ? 'thanks'
          : normalizedPrompt.match(/\b(who are you|what are you|your name|introduce yourself)\b/)
            ? 'identity'
            : normalizedPrompt.match(/\b(favorite food|favourite food|what do you eat|food do you like|favorite meal)\b/)
              ? 'food'
              : normalizedPrompt.match(/\b(favorite|favourite|favorite color|favourite colour|what do you like)\b/)
                ? 'favorites'
                : normalizedPrompt.match(/\b(hobby|hobbies|what do you do for fun|free time)\b/)
                  ? 'hobbies'
                  : normalizedPrompt.match(/\b(music|song|playlist|what do you listen)\b/)
                    ? 'music'
                    : normalizedPrompt.match(/\b(how are you|how do you feel|your mood|are you okay)\b/)
                      ? 'mood'
                      : normalizedPrompt.match(/\b(tell me more|really\?|why\?|what else|how so|interesting)\b/)
                        ? 'followup'
          : normalizedPrompt.match(/\b(sorry|apologize|apology|my bad|forgive me)\b/)
            ? 'apology'
            : normalizedPrompt.match(/\b(bored|boring|nothing to do)\b/)
              ? 'bored'
              : normalizedPrompt.match(/\b(excited|awesome|amazing|yay|let's go|cant wait)\b/)
                ? 'excited'
                : normalizedPrompt.match(/\b(confused|confusing|what does that mean|i do not understand|don't understand)\b/)
                  ? 'confused'
                  : normalizedPrompt.match(/\b(bye|goodbye|good night|see you|gotta go|leave)\b/)
                    ? 'goodbye'
                    : normalizedPrompt.match(/\b(roleplay|rp|pretend|act like|in character|quest|adventure)\b/)
                      ? 'roleplay'
                      : normalizedPrompt.match(/\b(cute|pretty|handsome|beautiful|smart|clever|pretty|cool|best bot|good bot)\b/)
                        ? 'compliment'
        : normalizedPrompt.match(/\b(help|how do|what do|can you|please)\b/)
          ? 'help'
            : 'default';
  const replies = TSUNDERE_REPLIES[category];
  const reply = replies[Math.floor(Math.random() * replies.length)];
  const gifs = TSUNDERE_GIFS[category] || TSUNDERE_GIFS.default;
  const includeGif = Math.random() < 0.65;
  const gif = includeGif ? gifs[Math.floor(Math.random() * gifs.length)] : null;

  await message.reply({
    content: reply,
    ...(gif ? { embeds: [{ image: { url: gif } }] } : {}),
    allowedMentions: { repliedUser: false },
  }).catch(error => {
    logger.warn('Mention responder could not reply:', error);
  });
  return true;
}

async function handlePrefixCommand(message, client) {
  try {
    const guildConfig = await getGuildConfig(client, message.guild.id);
    const prefix = guildConfig?.prefix || getCommandPrefix();
    const parsed = parsePrefixCommand(message.content, prefix);
    
    if (!parsed) {
      return; 
    }

    let { commandName, args } = parsed;
    const musicPrefixShortcut = commandName.toLowerCase();
    const MUSIC_PREFIX_SHORTCUTS = new Set(['leave', 'pause', 'resume', 'skip', 'stop', 'volume']);
    if (MUSIC_PREFIX_SHORTCUTS.has(musicPrefixShortcut)) {
      commandName = 'music';
      args = [musicPrefixShortcut, ...args];
    }

    logger.info(`Prefix command detected: ${commandName}, args: ${args.join(', ')}`);

    const resolvedCommandName = resolveCommandAlias(commandName);
    logger.info(`Resolved command name: ${resolvedCommandName}`);
    const command = client.commands.get(resolvedCommandName);

    if (!command) {
      logger.warn(`Command not found: ${resolvedCommandName}`);
      return; 
    }

    if (isMaintenanceMode() && !isBotOwner(message.author.id)) {
      await message.channel.send({
        embeds: [createEmbed({
          title: 'Maintenance Mode',
          description: getBotMessage('maintenanceMode'),
          color: 'warning',
        })],
      }).catch(() => {});
      return;
    }

    if (!isCommandCategoryEnabled(command.category)) {
      await message.channel.send({
        embeds: [createEmbed({
          title: 'Feature Disabled',
          description: getBotMessage('commandDisabled'),
          color: 'error',
        })],
      }).catch(() => {});
      return;
    }

    const restriction = getPrefixRestriction(command, args, resolveSubcommandAlias);
    if (!supportsPrefixExecution(command) || restriction.blocked) {
      if (restriction.blocked && restriction.reason) {
        const embed = createEmbed({
          title: 'Slash Command Only',
          description: `${restriction.reason}\nUse \`/${resolvedCommandName}\` instead.`,
          color: 'info',
        });
        await message.channel.send({ embeds: [embed] }).catch(() => {});
      }
      return;
    }

    if (!(await isCommandEnabled(client, message.guild.id, resolvePrefixAccessKey(command.data, args), command.category))) {
      const embed = createEmbed({
        title: 'Command Disabled',
        description: 'This command has been disabled for this server.',
        color: 'error',
      });
      await message.channel.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    const mockInteractionForProtection = {
      guildId: message.guild.id,
      user: message.author,
    };
    const abuseProtection = await enforceAbuseProtection(
      mockInteractionForProtection,
      command,
      resolvedCommandName,
    );
    if (!abuseProtection.allowed) {
      const formattedCooldown = formatCooldownDuration(abuseProtection.remainingMs);
      const embed = createEmbed({
        title: 'Command Cooldown',
        description: `This command is on cooldown. Please wait ${formattedCooldown} before trying again.`,
        color: 'error',
      });
      await message.channel.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    logger.info(`Executing prefix command: ${prefix}${commandName} (resolved to ${resolvedCommandName}) by ${message.author.tag}`);
    
    await executePrefixCommand(command, message, args, client, prefix, guildConfig);
  } catch (error) {
    logger.error('Error handling prefix command:', error);
  }
}

async function handleCountingGame(message, client) {
  try {
    const config = await getCountingGameConfig(client, message.guild.id);
    if (!config.enabled || !config.channelId || message.channel.id !== config.channelId) {
      return false;
    }

    const content = message.content.trim();
    const validCount = isValidCountingMessage(content, config);
    const invalidAttempt = !validCount || message.author.id === config.lastUserId;

    if (invalidAttempt) {
      await message.delete().catch(() => {});
      await saveCountingGameConfig(client, message.guild.id, {
        ...config,
        nextNumber: 1,
        lastUserId: null,
        currentStreak: 0,
      });

      const failureMessage = await message.channel.send(`❌ Count broken by <@${message.author.id}>. The sequence has been reset to **1**.`);
      setTimeout(() => {
        failureMessage.delete().catch(() => {});
      }, 10000);

      return true;
    }

    await recordCorrectCount(client, message.guild.id, message.author.id);
    return true;
  } catch (error) {
    logger.error('Error handling counting game:', error);
    return false;
  }
}

async function handleLeveling(message, client) {
  try {
    const rateLimitKey = `xp-event:${message.guild.id}:${message.author.id}`;
    const canProcess = await checkRateLimit(rateLimitKey, MESSAGE_XP_RATE_LIMIT_ATTEMPTS, MESSAGE_XP_RATE_LIMIT_WINDOW_MS);
    if (!canProcess) {
      return;
    }

    const levelingConfig = await getLevelingConfig(client, message.guild.id);
    
    if (!levelingConfig?.enabled) {
      return;
    }

    if (levelingConfig.ignoredChannels?.includes(message.channel.id)) {
      return;
    }

    if (levelingConfig.ignoredRoles?.length > 0) {
      const member = await message.guild.members.fetch(message.author.id).catch(() => {
        return null;
      });
      if (member && member.roles.cache.some(role => levelingConfig.ignoredRoles.includes(role.id))) {
        return;
      }
    }

    if (levelingConfig.blacklistedUsers?.includes(message.author.id)) {
      return;
    }

    if (!message.content || message.content.trim().length === 0) {
      return;
    }

    const userData = await getUserLevelData(client, message.guild.id, message.author.id);

    const cooldownTime = levelingConfig.xpCooldown || 60;
    const now = Date.now();
    const timeSinceLastMessage = now - (userData.lastMessage || 0);

    if (timeSinceLastMessage < cooldownTime * 1000) {
      return;
    }

    const minXP = levelingConfig.xpRange?.min || levelingConfig.xpPerMessage?.min || 15;
    const maxXP = levelingConfig.xpRange?.max || levelingConfig.xpPerMessage?.max || 25;

    const safeMinXP = Math.max(1, minXP);
    const safeMaxXP = Math.max(safeMinXP, maxXP);

    const xpToGive = Math.floor(Math.random() * (safeMaxXP - safeMinXP + 1)) + safeMinXP;

    let finalXP = xpToGive;
    if (levelingConfig.xpMultiplier && levelingConfig.xpMultiplier > 1) {
      finalXP = Math.floor(finalXP * levelingConfig.xpMultiplier);
    }

    const result = await addXp(client, message.guild, message.member, finalXP);

    if (result?.leveledUp) {
      logger.info(
        `${message.author.tag} leveled up to level ${result.level} in ${message.guild.name}`
      );
    }
  } catch (error) {
    logger.error('Error handling leveling for message:', error);
  }
}