export const OC_RARITIES = {
    common: { label: 'Common', color: '#95A5A6', weight: 55 },
    uncommon: { label: 'Uncommon', color: '#2ECC71', weight: 25 },
    rare: { label: 'Rare', color: '#3498DB', weight: 13 },
    epic: { label: 'Epic', color: '#9B59B6', weight: 6 },
    legendary: { label: 'Legendary', color: '#F1C40F', weight: 1 },
};

export const SPIN_TABLES = {
    race: ['Common', 'Uncommon', 'Rare', 'Rare', 'Rare', 'Uncommon', 'Epic', 'Legendary', 'Rare', 'Rare', 'Ancient', 'Mythic', 'Mythic', '???'].map((rarity, index) => [rarity, [
        'Human Race', 'Cat Race', 'Elf Race', 'Fairy Race', 'Imp Demon Race', 'Beast Race', 'Oni Race', 'Lion Race', 'Spirit Race', 'Merfolk Race', 'Archaic Race', 'Underworld Demon', 'Angel', 'Vampire Race',
    ][index]]),
    rmage: ['Common', 'Uncommon', 'Rare'].map((rarity, index) => [rarity, ['Apprentice Mage', 'Grade 4 Mage', 'Grade 3 Mage'][index]]),
    manat: ['Common', 'Legendary', 'Rare', 'Legendary', 'Mythic', '???'].map((rarity, index) => [rarity, ['Ordinary Mana', 'Pure Mana', 'Tainted Mana', 'Dark Mana', 'No Mana', 'Demon King Mana'][index]]),
    rsword: ['Common', 'Uncommon', 'Rare'].map((rarity, index) => [rarity, ['Rookie Rank', 'Intermediate Rank', 'Advanced Rank'][index]]),
    clvl: ['Common', 'Uncommon', 'Uncommon', 'Rare'].map((rarity, index) => [rarity, ['F Rank', 'E Rank', 'D Rank', 'C Rank'][index]]),
    rank: ['Common', 'Uncommon', 'Uncommon', 'Rare'].map((rarity, index) => [rarity, ['F Rank', 'E Rank', 'D Rank', 'C Rank'][index]]),
};

export const SPIN_TYPE_LABELS = {
    race: 'Race',
    rmage: 'Mage Rank',
    manat: 'Mana Type',
    rsword: 'Sword Rank',
    clvl: 'Combat Level',
    rank: 'Adventure Rank',
};

export function getSpinTypeLabel(config, type) {
    return config?.spinNames?.[type] || SPIN_TYPE_LABELS[type] || 'Spin';
}

export function normalizeSpinType(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 32);
}

export const SPIN_RARITY_COLORS = {
    Common: '#95A5A6',
    Uncommon: '#2ECC71',
    Rare: '#3498DB',
    Epic: '#9B59B6',
    Legendary: '#F1C40F',
    Ancient: '#E67E22',
    Mythic: '#8E44AD',
    '???': '#E91E63',
};

export function getSpinTable(config, type = 'race') {
    const customTable = config?.spinTables?.[type];
    return Array.isArray(customTable)
        ? customTable
        : (SPIN_TABLES[type] || SPIN_TABLES.race);
}

export function getSpinTypes(config = {}) {
    return [...new Set([
        ...Object.keys(SPIN_TABLES),
        ...Object.keys(config.spinTables || {}),
    ])];
}

export function chooseSpinResult(type = 'race', config = {}) {
    const table = getSpinTable(config, type);
    const [rarity, result] = table[Math.floor(Math.random() * table.length)];
    return { type, typeLabel: SPIN_TYPE_LABELS[type] || SPIN_TYPE_LABELS.race, rarity, result };
}

export const OC_PARTS = {
    firstNames: ['Ari', 'Marlow', 'Vesper', 'Niko', 'Rowan', 'Sable', 'Kieran', 'Juniper', 'Remy', 'Sol'],
    lastNames: ['Ashford', 'Vale', 'Holloway', 'Nightbloom', 'Rook', 'Starling', 'Wren', 'Duskfall', 'Ember', 'Thorne'],
    pronouns: ['she/her', 'he/him', 'they/them', 'she/they', 'he/they'],
    species: ['Human', 'Elf', 'Tiefling', 'Kitsune', 'Android', 'Dragonborn', 'Shapeshifter', 'Fae'],
    roles: ['wandering mage', 'reluctant heir', 'monster hunter', 'street medic', 'skyship pilot', 'court spy', 'runaway experiment', 'treasure seeker'],
    traits: ['unfailingly curious', 'quietly protective', 'charming but evasive', 'blunt and principled', 'dramatic under pressure', 'patient until provoked', 'restless and ambitious', 'warm with a sharp edge'],
    powers: ['hears forgotten memories', 'controls a small flame', 'sees possible futures', 'speaks with machines', 'bends shadows into tools', 'always finds lost doors', 'borrows another voice', 'heals through music'],
    flaws: ['cannot refuse a challenge', 'is terrified of being known', 'loses control when angry', 'owes a dangerous favor', 'lies by reflex', 'never asks for help', 'is haunted by one mistake', 'protects the wrong people'],
    aesthetics: ['velvet and silver', 'weathered leather', 'neon and chrome', 'ink-black lace', 'sun-faded linen', 'military brass', 'mismatched charms', 'storm-blue silk'],
};

export function chooseWeightedRarity() {
    const entries = Object.entries(OC_RARITIES);
    const totalWeight = entries.reduce((total, [, rarity]) => total + rarity.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const [name, rarity] of entries) {
        roll -= rarity.weight;
        if (roll < 0) return name;
    }

    return 'common';
}

export function pick(values) {
    return values[Math.floor(Math.random() * values.length)];
}

export function createOcProfile() {
    const rarity = chooseWeightedRarity();
    return {
        name: `${pick(OC_PARTS.firstNames)} ${pick(OC_PARTS.lastNames)}`,
        pronouns: pick(OC_PARTS.pronouns),
        species: pick(OC_PARTS.species),
        role: pick(OC_PARTS.roles),
        trait: pick(OC_PARTS.traits),
        power: pick(OC_PARTS.powers),
        flaw: pick(OC_PARTS.flaws),
        aesthetic: pick(OC_PARTS.aesthetics),
        rarity,
    };
}

export function formatOcProfile(profile) {
    return [
        `**${profile.name}** · ${profile.pronouns}`,
        `**Species:** ${profile.species}`,
        `**Role:** ${profile.role}`,
        `**Trait:** ${profile.trait}`,
        `**Power:** ${profile.power}`,
        `**Flaw:** ${profile.flaw}`,
        `**Aesthetic:** ${profile.aesthetic}`,
    ].join('\n');
}
