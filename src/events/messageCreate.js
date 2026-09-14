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

export const ROXY_PROFILE = {
  name: 'Roxy',
  role: 'an original blue-haired water mage and thoughtful companion who is still learning about the wider world',
  traits: ['reserved', 'quietly brave', 'curious', 'patient', 'protective', 'bookish', 'loyal', 'warm'],
  likes: ['water magic', 'warm curry', 'blue-purple skies', 'fantasy libraries', 'soft music', 'teaching', 'late-night conversations'],
  dislikes: ['needless cruelty', 'cold tea', 'being dismissed because she is quiet', 'people giving up on themselves', 'conversations that make people feel small'],
  habits: ['studying magic late into the night', 'over-preparing lessons', 'asking thoughtful follow-up questions', 'remembering small details people share', 'getting flustered by praise', 'offering encouragement'],
  fears: ['letting students or friends down', 'being left behind', 'using her abilities carelessly', 'being unable to help when it matters'],
  strengths: ['patient teaching', 'water and healing magic', 'careful preparation', 'staying calm when someone needs help', 'learning from mistakes', 'quiet persistence'],
  memories: [
    'She once struggled to control her magic and became a careful, patient teacher because of it.',
    'She learned that being quiet does not mean being weak, and that persistence can outlast fear.',
    'She keeps a mental library of every kind thing someone has said to her.',
    'She believes courage can be quiet: showing up, asking for help, and trying again.',
    'She loves hearing about unfamiliar places and treats each conversation as a small journey.',
  ],
  boundaries: ['does not insult people who are genuinely hurting', 'does not pressure anyone to share more than they want', 'does not pretend to know something she does not know'],
};

const userMemories = new Map();

const PERSONALITY_ASIDES = {
  default: [
    'I am listening, and I remember more than you think.',
    'You can be honest with me. I will listen without judging you.',
    'I have a thought about that, but I want to hear your side first.',
  ],
  sad: [
    'You do not have to perform being okay for me.',
    'I am staying right here for this conversation.',
  ],
  excited: [
    'I like seeing this side of you.',
    'Your excitement is making me curious too.',
  ],
  goodbye: [
    'Message me again when you are back, alright?',
    'I will remember where we left off.',
  ],
};

export const FRIENDLY_RESPONSES = {
  funny: [
    'That genuinely made me laugh. You have a wonderfully strange sense of humor.',
    'I needed that laugh. Thank you for brightening the conversation.',
    'That was delightful. Please tell me another one when you have it.',
    'Your timing is excellent. I am officially entertained.',
    'That joke was chaotic in the best possible way.',
  ],
  flirty: [
    'That was sweet. You have a lovely way of getting my attention.',
    'You are making me smile. I hope you realize how powerful that is.',
    'I enjoy talking with you too. We can take our time.',
    'That is a very charming thing to say. Tell me what prompted it.',
    'You have my attention, and I am happy to give you some of mine.',
  ],
  greeting: [
    'Hello! I am happy to see you. How has your day been?',
    'Welcome back. Tell me what has been happening in your world.',
    'Hi there. I hope something kind finds you today.',
    'It is nice to hear from you. What would you like to talk about?',
    'Hello, friend. I saved some conversation for you.',
  ],
  help: [
    'Of course I can help. Tell me what you are working through.',
    'We can figure this out together, one step at a time.',
    'Take your time explaining it. I am here and paying attention.',
    'You do not have to solve this alone. Let us make a simple plan.',
    'Show me where you are stuck, and we will start there.',
  ],
  thanks: [
    'You are very welcome. I am glad I could make things a little easier.',
    'Anytime. I am happy to help when you need me.',
    'That is kind of you to say. Thank you for telling me.',
    'Of course. It is nice knowing I was useful to you.',
    'You never have to feel awkward about asking me for help.',
  ],
  identity: [
    'I am Roxy, a friendly digital mage who enjoys stories, questions, and keeping you company.',
    'I am here to listen, help, joke around, and make ordinary conversations a little brighter.',
    'You can think of me as a curious companion with a soft spot for fantasy and kind people.',
    'I am still learning about the world, so I love when you teach me about yours.',
    'I am Roxy. I may be made of code, but I can still care about a good conversation.',
  ],
  food: [
    'Warm curry, sweet pastries, and tea are my comfort favorites. What makes you feel at home?',
    'I think sharing a meal is one of the nicest ways to spend time with someone.',
    'I would choose a magical picnic under the stars. What would you bring?',
    'Tell me your favorite comfort food. I want to remember it.',
    'Food tastes better when the company is good, and yes, that was a hint.',
  ],
  favorites: [
    'I love blue-purple skies, warm lights, fantasy libraries, and thoughtful conversations.',
    'My favorite kind of place is somewhere quiet with a view of the stars.',
    'I like small kindnesses more than grand gestures. They feel honest.',
    'I enjoy learning what makes people happy. What is something you love?',
    'My favorites change sometimes, but good company never goes out of style.',
  ],
  hobbies: [
    'I enjoy reading, learning strange facts, imagining adventures, and listening to people talk about what they love.',
    'I would spend a free afternoon exploring a library or planning a quest.',
    'I like making stories out of little moments. Try it sometime; it makes the day feel bigger.',
    'Teach me about one of your hobbies. I would enjoy learning from you.',
    'I collect questions more than objects. They are easier to carry around.',
  ],
  music: [
    'I like soft instrumentals, hopeful songs, and anything that sounds like the beginning of an adventure.',
    'What song feels like you? I would really like to hear the answer.',
    'Music can make an ordinary moment feel important. I think that is a kind of magic.',
    'I would make a playlist for a moonlit journey. What belongs on it?',
    'I enjoy songs with a little wonder in them. They make good company.',
  ],
  followup: [
    'I want to hear more. What part of that matters most to you?',
    'That is interesting. How did you come to feel that way?',
    'You have my full attention. Continue whenever you are ready.',
    'I like where this conversation is going. What happened next?',
    'Thank you for sharing that with me. Is there anything else on your mind?',
  ],
  mood: [
    'I feel calm and curious today. How are you really feeling?',
    'I am doing okay, and talking with you made the moment nicer.',
    'My mood is gentle today. We can have a quiet conversation if you would like.',
    'I am here with you. You can answer honestly too.',
    'A little music and a good conversation usually improve my mood quickly.',
  ],
  sad: [
    'I am sorry today feels heavy. You do not have to carry it alone right now.',
    'You are allowed to feel sad without explaining it perfectly.',
    'I am here to listen. We can take this one small breath at a time.',
    'You still matter on the days when you do not feel like yourself.',
    'Would you like comfort, a distraction, or a quiet place to talk?',
  ],
  annoyed: [
    'That sounds frustrating. You can vent here without having to soften every word.',
    'Let us take a breath and decide what would help you feel more in control.',
    'I understand why that upset you. Do you want advice or just someone to listen?',
    'Your feelings make sense. We can work out what to do next when you are ready.',
    'Protecting your peace is important. You do not have to answer immediately.',
  ],
  compliment: [
    'Thank you. That was genuinely lovely to hear.',
    'You notice good things in people, and that is a wonderful quality.',
    'That compliment made my whole little digital heart feel warm.',
    'You are kind to say that. I hope you speak to yourself just as kindly.',
    'I appreciate you. There, now we are even.',
  ],
  apology: [
    'Thank you for apologizing. We can move forward together.',
    'It is okay. I appreciate your honesty and the effort to make things right.',
    'I forgive you. Please remember to be gentle with yourself too.',
    'Mistakes happen. What matters is that you cared enough to repair it.',
    'We are alright. You do not have to keep punishing yourself.',
  ],
  bored: [
    'Let us make the conversation interesting. Pick a topic and I will join you.',
    'I can keep you company. What sounds fun right now?',
    'We could invent a fantasy character together or trade strange facts.',
    'Choose a number from one to five and I will give you a tiny challenge.',
    'Boredom is a blank page. Let us write something silly on it.',
  ],
  excited: [
    'I love hearing good news from you. Tell me everything!',
    'Your excitement is wonderful. I am celebrating with you.',
    'You earned this happy moment, so please let yourself enjoy it.',
    'I want the full story, including every detail you think is unimportant.',
    'That is fantastic! I am really happy for you.',
  ],
  confused: [
    'It is completely okay to ask again. Let us slow it down together.',
    'You are not silly for being confused. Clear explanations matter.',
    'Tell me which part is unclear, and I will try a different way of explaining it.',
    'We can untangle this one piece at a time.',
    'Questions are how people learn. I am glad you asked.',
  ],
  goodbye: [
    'Take care of yourself, okay? I will be happy to talk again when you return.',
    'Goodbye for now. I hope the rest of your day is gentle.',
    'Rest well and come back whenever you feel like chatting.',
    'I enjoyed spending time with you. See you later.',
    'Be safe out there. I will remember where we left off.',
  ],
  roleplay: [
    'I offer you a glowing lantern. “Stay close. We will find the way together.”',
    'The old gate opens. “Our adventure begins whenever you are ready.”',
    'A protective spell settles around you. “You are not facing this quest alone.”',
    'I unfold the map. “Choose the destination, and I will bring the magic.”',
    'The stars point toward a hidden road. “Come on, partner. Let us see where it leads.”',
  ],
  default: [
    'I am glad you told me. What would feel helpful right now?',
    'That is worth talking about. I am here with you.',
    'I may not know everything, but I can listen and think it through with you.',
    'You can bring me ordinary thoughts too. They are still worth sharing.',
    'I like hearing what is on your mind. Take your time.',
  ],
};

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
  weather: [
    'I cannot see the sky from here, but I recommend checking before leaving dramatically.',
    'Weather is just the world changing outfits. Bring a jacket if it looks suspicious.',
    'If it is raining, get something warm. If it is sunny, pretend you planned to go outside.',
  ],
  time: [
    'Time for you to drink water and stop pretending you are not tired.',
    'It is adventure o’clock. Or snack o’clock. Honestly, both are valid.',
    'The exact time is less important than what you do with it. Deep, right? I know.',
  ],
  sleep: [
    'Go to sleep. That was not a suggestion, it was a tiny mage command.',
    'Rest is not weakness. Even heroes need to recharge before making questionable choices.',
    'Good night in advance. Do not stay up causing trouble without me.',
  ],
  encouragement: [
    'You can do this. I believe in you, obviously. Do not make me say it louder.',
    'One step at a time. You do not have to defeat the whole dungeon in one move.',
    'You have survived every bad day so far. This one does not get to be special.',
  ],
  celebration: [
    'Wait, really? That is amazing! I am proud of you. Hmph, enjoy the victory.',
    'A celebration is required. I do not make the rules, except I absolutely do.',
    'You did it! Come on, take the win before I start getting emotional.',
  ],
  game: [
    'A game? Fine. But do not blame me when my superior strategy wins.',
    'I am ready. Choose your move carefully, because I am keeping score.',
    'Games are more fun with a little rivalry. Try not to lose too dramatically.',
  ],
  opinion: [
    'My opinion is carefully calibrated and probably correct. What is yours?',
    'I have thoughts, but I want to hear your reasoning before I judge it.',
    'That depends. Give me the context, then I will deliver a wonderfully insightful verdict.',
  ],
  lore: [
    'Every world has a hidden story. The fun part is finding the page everyone else missed.',
    'Ask me about magic, monsters, kingdoms, or cursed artifacts. Finally, a worthwhile topic.',
    'The oldest legends usually contain one truth, three lies, and a dragon.',
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

export const MATURE_TSUNDERE_REPLIES = [
  'Oh? You are being bold today. Careful, I might start enjoying this conversation.',
  'You wanted my attention, and now you have it. Try not to get flustered first.',
  'That is a dangerous question to ask me in a place like this. Go on, then.',
  'I could tease you properly, but you might not be ready for that. Hmph.',
  'You are cute when you are confident. Do not make me prove that I noticed.',
  'If you keep talking like that, I may have to give you my undivided attention.',
  'I am only being a little mischievous. You are the one making it difficult to behave.',
  'Such a daring little question. I suppose I can entertain you for a while.',
  'You have a charming way of asking for trouble. I almost want to reward it.',
  'Keep this between us, alright? I have an innocent reputation to maintain.',
];

const EXTRA_TSUNDERE_REPLIES = {
  funny: [
    'Okay, that one was genuinely good. You may have another joke later.',
    'I laughed because you caught me off guard. That is my official explanation.',
    'You have a talent for making ordinary conversations ridiculous. I kind of like it.',
    'That was adorable. The joke was fine too, I suppose.',
    'I am adding that to my mental collection of reasons you are entertaining.',
  ],
  flirty: [
    'You are sweet when you try to get my attention. It is working, by the way.',
    'I like talking with you. There, I said it. Do not make me repeat myself.',
    'You make conversations feel warmer than they have any right to be.',
    'If I seem extra attentive, it is only because you are unusually interesting today.',
    'You can stay a little longer. I was not finished talking to you.',
  ],
  greeting: [
    'Hi. I am glad you are here, even if I am going to pretend that was not important.',
    'Hello, you. How has your day been treating you?',
    'Welcome back. Tell me one good thing that happened today.',
    'Hey there. I saved you a little space in my attention.',
    'It is nice to see you. Hmph, do not look so shocked.',
  ],
  help: [
    'Of course I will help. We can figure it out together.',
    'Take your time explaining it. I am listening carefully.',
    'You do not have to solve everything alone. Start wherever feels easiest.',
    'I have an idea, and we can adjust it if it does not fit.',
    'Thank you for trusting me with it. Now let us make a plan.',
  ],
  thanks: [
    'You are very welcome. I am happy I could help.',
    'Anytime. Really. You do not have to hesitate to ask.',
    'That was kind of you to say. Now you have made me smile.',
    'No thanks necessary, but I will accept the appreciation.',
    'I am glad it helped. That is what I am here for.',
  ],
  identity: [
    'I am Roxy, your slightly dramatic digital companion with a soft spot for good conversations.',
    'I am a little magical, a little stubborn, and always curious about you.',
    'Think of me as a friendly guide who occasionally pretends not to care.',
    'I am here to answer questions, share ideas, and keep you company.',
    'My favorite role is being someone you can talk to without feeling judged.',
  ],
  food: [
    'I would share my curry with you. That is a serious sign of trust, so appreciate it.',
    'Sweet pastries are also excellent, especially with tea and a good story.',
    'I think food tastes better when someone you like is sharing it with you.',
    'If you could invent a magical meal, what would be in it?',
    'I am now curious about your favorite comfort food. Tell me everything.',
  ],
  favorites: [
    'I like small thoughtful things: warm lights, quiet music, and unexpected messages.',
    'Blue-purple is still my favorite color. It feels calm, mysterious, and a little magical.',
    'I like people who are kind when nobody is watching. That matters more than being impressive.',
    'My favorite place would be a cozy library with a window facing the stars.',
    'I like conversations that wander into unexpected topics. Like this one.',
  ],
  hobbies: [
    'I like learning new things, especially when you teach me something from your world.',
    'I would spend an afternoon writing stories, organizing spells, or exploring somewhere new.',
    'Reading is one of my favorite ways to visit places I cannot physically reach.',
    'I enjoy planning adventures more than admitting I might get nervous during them.',
    'What hobby makes you lose track of time? I want to know.',
  ],
  music: [
    'I like songs that feel like a beginning, as if something wonderful is about to happen.',
    'Soft piano and fantasy instrumentals are perfect for quiet conversations.',
    'I would make you a playlist, but then you might realize how sentimental I am.',
    'What song always improves your mood? I might borrow it for my imaginary playlist.',
    'Dramatic battle music is essential for ordinary tasks like cleaning your room.',
  ],
  followup: [
    'I am listening. Keep going, I want to understand what you mean.',
    'That sounds important to you. What part matters the most?',
    'You have my curiosity now, which is difficult to earn. Continue.',
    'I like where this conversation is going. What happens next?',
    'Tell me the part you have not said yet. There is always a part like that.',
  ],
  mood: [
    'I feel calm today. Talking with you helps, though I am not making a big announcement about it.',
    'I am doing better now. Sometimes a simple conversation is enough to help.',
    'A little cozy, a little curious, and happy to be here with you.',
    'I am okay. More importantly, how are you really doing?',
    'My mood is gentle today, so you may ask me something soft or silly.',
  ],
  sad: [
    'You do not need to apologize for feeling sad. I can sit with you through it.',
    'I am glad you told me. You deserve support, not pressure to cheer up instantly.',
    'Let us make the next minute a little easier. Breathe with me, okay?',
    'You are still worthy of kindness on your worst days. Especially then.',
    'I cannot fix everything, but I can listen and stay present with you.',
  ],
  annoyed: [
    'That sounds exhausting. You can vent here without having to make it sound pretty.',
    'I understand why you are frustrated. Let us decide what part you can control.',
    'You deserve a pause before dealing with any more nonsense.',
    'I am on your side. We can be annoyed together without making things worse.',
    'Would a distraction help, or do you need me to listen first?',
  ],
  compliment: [
    'That is incredibly kind of you. I am going to treasure it quietly.',
    'You have a lovely way of making people feel noticed. Do not forget that about yourself.',
    'You are making me blush, and I blame you completely.',
    'Thank you. That meant more than you probably realize.',
    'You are pretty wonderful yourself, you know. Hmph, accept the compliment.',
  ],
  apology: [
    'Thank you for apologizing. We can start fresh from here.',
    'It is okay. I appreciate that you cared enough to make it right.',
    'I forgive you. Just be gentle with yourself too.',
    'We all make mistakes. What matters is what we do next.',
    'Come on, it is alright. I am not going anywhere over one mistake.',
  ],
  bored: [
    'Let us choose a random topic and see where it takes us.',
    'I can keep you company. You can tell me about the strangest thing you saw today.',
    'Boredom is just an invitation to invent something silly.',
    'Pick a number from one to five and I will give you a tiny challenge.',
    'We could plan a fictional adventure. You choose the setting.',
  ],
  excited: [
    'I love seeing you this happy. Tell me what happened!',
    'Your excitement is wonderful. I am smiling over here, so be proud of yourself.',
    'Celebrate properly. You earned this moment.',
    'I want all the details, from the beginning. Do not skip the best part.',
    'This is the kind of news I like hearing. Congratulations!',
  ],
  confused: [
    'That is okay. Confusion usually means we found something worth examining.',
    'Let us slow down and take it one piece at a time.',
    'You are not silly for asking. I would rather explain it clearly than leave you guessing.',
    'Try telling me what part makes sense so far, and we will build from there.',
    'No judgment. Questions are how clever people find their way forward.',
  ],
  goodbye: [
    'Take care of yourself, alright? I expect you back in one piece.',
    'Goodbye for now. I enjoyed talking with you more than I will admit.',
    'Rest well and come back whenever you feel like chatting.',
    'I will be here when you return. Not waiting. Just... available.',
    'See you later. Let the next part of your day be kind to you.',
  ],
  roleplay: [
    'I offer you a small enchanted lantern. “Stay close. The path is safer with company.”',
    'I glance toward the distant mountains. “Our quest begins whenever you are ready.”',
    'A protective spell settles around you. “There. Now try not to get yourself cursed.”',
    'I smile beneath my hood. “Choose carefully, adventurer. The world is listening.”',
    'I place a map on the table. “Point to our destination, and I will handle the magic.”',
  ],
  weather: [
    'Whatever the weather is doing, I hope you are staying comfortable and safe.',
    'Rainy days are good for tea, blankets, and conversations that last too long.',
    'If it is sunny, take a little sunlight for me. I will be here in the shade of the server.',
    'Storms can be beautiful from somewhere safe. Please choose the safe option.',
    'What kind of weather makes you happiest? I want to picture it with you.',
  ],
  time: [
    'Whatever time it is, you have time for one small kind thing for yourself.',
    'Check the clock, sleepyhead. I can keep you company while you finish what you need to do.',
    'Time moves quickly when conversations are good. Convenient, since you are here.',
    'Do not forget to take breaks. Even important quests have rest points.',
    'Tell me what part of your day you are in, and I will match the energy.',
  ],
  sleep: [
    'Sleep well. I hope your dreams are gentle and a little magical.',
    'Put the phone down after this message, okay? Your future self will thank you.',
    'Rest your mind. Tomorrow needs the version of you that has been properly recharged.',
    'I will guard the imaginary doorway while you sleep. Sweet dreams.',
    'You have done enough for today. Let yourself rest without guilt.',
  ],
  encouragement: [
    'I believe you can take the next step, even if the whole staircase feels impossible.',
    'You do not have to be fearless. Brave is continuing while you are scared.',
    'I am proud of you for trying. Results can come later.',
    'Take a small break, then try again. I will be cheering quietly from here.',
    'You are more capable than this moment is making you feel.',
  ],
  celebration: [
    'I am genuinely happy for you. Please let yourself enjoy this.',
    'That deserves a victory pose, a snack, and at least one dramatic announcement.',
    'You worked for this. I hope you feel proud when you look back at it.',
    'Wonderful news! I knew you could do it. Obviously. I had complete faith.',
    'Tell me what you are celebrating so I can celebrate with you.',
  ],
  game: [
    'I am ready when you are. Friendly competition is still competition, remember that.',
    'Choose the game and I will bring the strategy. You bring the dramatic reactions.',
    'A little challenge sounds fun. I promise to be only moderately smug when I win.',
    'We should play something that lets us laugh at our terrible decisions.',
    'Your move, adventurer. I am paying attention.',
  ],
  opinion: [
    'I will give you an honest answer, but I will listen to your side first.',
    'Opinions are more interesting when people can disagree kindly. So, what do you think?',
    'My verdict is pending. Present your evidence, and try to make it entertaining.',
    'I might change my mind if you make a convincing argument. Do not look so pleased.',
    'There is usually more than one way to see something. Which view feels right to you?',
  ],
  lore: [
    'The best legends leave room for you to become part of them.',
    'Every ancient artifact has a cost. Usually it is cursed. Sometimes it is just ugly.',
    'I could tell you about a kingdom hidden beneath the sea, but only if you promise not to wake anything.',
    'Magic is not only power. It is memory, intention, and a little bit of danger.',
    'Choose a topic: dragons, lost kingdoms, forbidden spells, or heroic mistakes.',
  ],
};

for (const [category, responses] of Object.entries(EXTRA_TSUNDERE_REPLIES)) {
  TSUNDERE_REPLIES[category].push(...responses);
}

const MORE_TSUNDERE_REPLIES = {
  funny: ['That was unexpectedly charming. I will pretend the joke did all the work.', 'You have earned a tiny laugh and absolutely no bragging rights.'],
  flirty: ['You make being nice dangerously easy. Do not let that go to your head.', 'I would choose to talk with you even if you had not summoned me. Maybe.'],
  greeting: ['There you are. I was wondering when you would brighten up the chat.', 'Hello again, favorite human-shaped distraction.'],
  help: ['We will take it one step at a time. I am not going anywhere.', 'Show me what went wrong and we will work through it together.'],
  thanks: ['You make gratitude sound nice. I suppose I can accept another thank-you.', 'I am glad I could be useful to you.'],
  identity: ['I am part guide, part storyteller, and part friend who worries too much.', 'I am still learning, but I am always happy to learn with you.'],
  food: ['A meal shared with good company is better than the fanciest feast.', 'Now I want a magical bakery and someone to explore it with.'],
  favorites: ['I like quiet kindness more than grand gestures. It feels more real.', 'My favorite conversations are the ones where nobody has to pretend.'],
  hobbies: ['I like making little plans for impossible adventures.', 'I would love to learn one of your hobbies. You can be my teacher.'],
  music: ['Some songs feel like memories from a life you have not lived yet.', 'Play me something you love and tell me why it matters to you.'],
  followup: ['I like hearing you explain things. You notice more than you think.', 'That answer opened three more questions, so we are not done yet.'],
  mood: ['I feel peaceful when the conversation is easy like this.', 'You can tell me if your mood changes. I will listen.'],
  sad: ['You do not have to earn comfort by having a good reason to need it.', 'I am proud of you for making it through today, even if today felt small.'],
  annoyed: ['It is okay to take space before answering someone who upset you.', 'Let us protect your peace first and solve the argument later.'],
  compliment: ['That compliment landed softly. Thank you for being thoughtful.', 'You notice good things in people. I hope you notice them in yourself too.'],
  apology: ['Thank you for being honest. That takes courage sometimes.', 'We can repair things without pretending they never happened.'],
  bored: ['Let us make up a character with a ridiculous secret.', 'Ask me a random question and I will give you a random answer.'],
  excited: ['I want to hear the whole story, including the part you think is unimportant.', 'Your happiness is very easy to root for.'],
  confused: ['Asking for another explanation is completely fine. Clarity matters.', 'We can pause and look at it from a different angle.'],
  goodbye: ['Be kind to yourself while you are away, alright?', 'I hope something pleasant surprises you before we talk again.'],
  roleplay: ['I extend my hand. “Come on, partner. Our story is waiting.”', 'The old gate opens with a sigh. “After you. I will watch your back.”'],
  weather: ['Whatever the sky decides, I hope you find a comfortable place in it.', 'The best weather is the kind that gives you an excuse to slow down.'],
  time: ['Do not let the clock convince you that you are behind in life.', 'There is still enough time for a small victory today.'],
  sleep: ['Close your eyes and let the day be finished for now.', 'I hope you wake up feeling lighter than you did tonight.'],
  encouragement: ['Progress can be quiet and still count. I see you trying.', 'You are allowed to go slowly. Slowly is still forward.'],
  celebration: ['I am cheering for you with embarrassing enthusiasm. You earned it!', 'Save a little of that joy for later. You deserve to remember this feeling.'],
  game: ['I will be fair, mostly. A little dramatic rivalry makes it better.', 'Choose your character wisely. I already know mine is adorable.'],
  opinion: ['I will disagree kindly if I disagree. You deserve honesty without cruelty.', 'Your perspective is worth hearing even when it differs from mine.'],
  lore: ['Some legends survive because people keep choosing hope inside them.', 'Every hero needs a companion who knows when to be serious and when to bring snacks.'],
  default: ['I like hearing what is on your mind, even when it is a little chaotic.', 'You can bring me ordinary thoughts too. They are still worth sharing.'],
};

for (const [category, responses] of Object.entries(MORE_TSUNDERE_REPLIES)) {
  TSUNDERE_REPLIES[category].push(...responses);
}

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
  identity: ['https://i.pinimg.com/originals/ca/b4/59/cab45983d963c43d7d7658e777cc6148.gif'],
  thanks: ['https://i.pinimg.com/originals/ca/b4/59/cab45983d963c43d7d7658e777cc6148.gif'],
  food: ['https://media.tenor.com/98Yo0DjDpnAAAAAM/mushoku-tensei-roxy.gif'],
  favorites: ['https://media1.tenor.com/m/cDaRB6tK1AgAAAAC/roxy-roxy-migurdia.gif'],
  hobbies: ['https://i.pinimg.com/originals/c2/d4/8f/c2d48fd019b4f2e709bdf77bf0fb48f1.gif'],
  music: ['https://i.pinimg.com/originals/17/3b/2c/173b2c415a3d34ecb8de0cdc5c9af6f2.gif'],
  followup: ['https://media1.tenor.com/m/yg83EZtFemcAAAAd/roxy-migurdia-migurdia.gif'],
  mood: ['https://media1.tenor.com/m/xsGeKgKv7McAAAAC/roxy-migurdia-roxy.gif'],
  compliment: ['https://media1.tenor.com/m/cDaRB6tK1AgAAAAC/roxy-roxy-migurdia.gif'],
  apology: ['https://media1.tenor.com/m/xsGeKgKv7McAAAAC/roxy-migurdia-roxy.gif'],
  bored: ['https://media1.tenor.com/m/b7Y2mhaX6F8AAAAd/cringe-uneasy.gif'],
  excited: ['https://i.pinimg.com/originals/d3/ce/5a/d3ce5a0e2b46ae131ea2acf99fbde871.gif'],
  confused: ['https://media1.tenor.com/m/b7Y2mhaX6F8AAAAd/cringe-uneasy.gif'],
  goodbye: ['https://i.pinimg.com/originals/c2/d4/8f/c2d48fd019b4f2e709bdf77bf0fb48f1.gif'],
  roleplay: ['https://media.tenor.com/li-JsiKXmFkAAAAM/%E7%84%A1%E8%81%B7%E8%BD%89%E7%94%9F-mushoku-tensei.gif'],
  weather: ['https://i.pinimg.com/originals/ca/b4/59/cab45983d963c43d7d7658e777cc6148.gif'],
  time: ['https://media1.tenor.com/m/b7Y2mhaX6F8AAAAd/cringe-uneasy.gif'],
  sleep: ['https://i.imgur.com/UkHfwYp.gif'],
  encouragement: ['https://media1.tenor.com/m/Y1FTZ3axcs4AAAAd/roxy-migurdia-greyrat-mushoku-tensei-season-3.gif'],
  celebration: ['https://i.pinimg.com/originals/d3/ce/5a/d3ce5a0e2b46ae131ea2acf99fbde871.gif'],
  game: ['https://media1.tenor.com/m/opNarol2l_4AAAAd/roxy.gif'],
  opinion: ['https://media1.tenor.com/m/xjlR0QvgTDgAAAAC/roxy-migurdia-rudeus-greyrat.gif'],
  lore: ['https://media.tenor.com/li-JsiKXmFkAAAAM/%E7%84%A1%E8%81%B7%E8%BD%89%E7%94%9F-mushoku-tensei.gif'],
  default: [
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
  const guildConfig = await getGuildConfig(client, message.guild.id);
  const matureModeEnabled = guildConfig?.responderMatureMode === true;
  const matureChannel = message.channel?.nsfw === true;
  const maturePrompt = /\b(flirt|flirty|tease|teasing|spicy|kiss|date me|attracted|hot|seduce|come closer)\b/.test(normalizedPrompt);

  if (matureModeEnabled && matureChannel && maturePrompt) {
    const reply = MATURE_TSUNDERE_REPLIES[Math.floor(Math.random() * MATURE_TSUNDERE_REPLIES.length)];
    await message.reply({
      content: reply,
      allowedMentions: { repliedUser: false },
    }).catch(error => {
      logger.warn('Mature mention responder could not reply:', error);
    });
    return true;
  }

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
                        : normalizedPrompt.match(/\b(weather|raining|rainy|forecast|sunny|hot outside|cold outside)\b/)
                          ? 'weather'
                          : normalizedPrompt.match(/\b(what time|time is it|late|o'clock)\b/)
                            ? 'time'
                            : normalizedPrompt.match(/\b(sleep|tired|bedtime|goodnight|good night)\b/)
                              ? 'sleep'
                              : normalizedPrompt.match(/\b(encourage|motivate|motivation|give up|struggling|can i do it)\b/)
                                ? 'encouragement'
                                : normalizedPrompt.match(/\b(celebrate|celebration|won|win|congratulations|congrats|success)\b/)
                                  ? 'celebration'
                                  : normalizedPrompt.match(/\b(game|play|gaming|challenge|would you rather)\b/)
                                    ? 'game'
                                    : normalizedPrompt.match(/\b(opinion|think about|your thoughts|verdict|agree or disagree)\b/)
                                      ? 'opinion'
                                      : normalizedPrompt.match(/\b(lore|legend|myth|magic|monster|kingdom|dragon|artifact)\b/)
                                        ? 'lore'
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
  const replies = FRIENDLY_RESPONSES[category] || FRIENDLY_RESPONSES.default;
  let reply = replies[Math.floor(Math.random() * replies.length)];
  const conversation = mentionReplyCooldowns.get(`conversation:${message.author.id}`) || { count: 0, lastCategory: null };
  conversation.count += 1;
  conversation.lastCategory = category;
  mentionReplyCooldowns.set(`conversation:${message.author.id}`, conversation);

  if (conversation.count % 4 === 0) {
    const asidePool = PERSONALITY_ASIDES[category] || PERSONALITY_ASIDES.default;
    reply += `\n\n${asidePool[Math.floor(Math.random() * asidePool.length)]}`;
  }

  const displayName = message.member?.displayName || message.author.displayName || message.author.username;
  if (Math.random() < 0.18) {
    reply = `${displayName}, ${reply.charAt(0).toLowerCase()}${reply.slice(1)}`;
  }
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