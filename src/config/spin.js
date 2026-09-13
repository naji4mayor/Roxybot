export const RARITY_COLORS = {
    common: '#95A5A6',
    uncommon: '#2ECC71',
    rare: '#3498DB',
    epic: '#9B59B6',
    legendary: '#F1C40F',
};

export const RARITY_NAMES = Object.keys(RARITY_COLORS);

export const DEFAULT_SPIN_ITEMS = [
    { id: 'spin_pebble', name: 'Lucky Pebble', emoji: '🪨', rarity: 'common', value: 25, weight: 30 },
    { id: 'spin_sticker', name: 'Shiny Sticker', emoji: '✨', rarity: 'common', value: 50, weight: 30 },
    { id: 'spin_coin', name: 'Silver Coin', emoji: '🪙', rarity: 'uncommon', value: 125, weight: 25 },
    { id: 'spin_crystal', name: 'Blue Crystal', emoji: '🔷', rarity: 'rare', value: 350, weight: 10 },
    { id: 'spin_crown', name: 'Enchanted Crown', emoji: '👑', rarity: 'epic', value: 1000, weight: 4 },
    { id: 'spin_relic', name: 'Ancient Relic', emoji: '🏺', rarity: 'legendary', value: 5000, weight: 1 },
];

export function normalizePoolName(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

export function getSpinItems(config, poolName = 'standard') {
    const configuredItems = config?.spinPools?.[poolName]?.items;

    if (Array.isArray(configuredItems) && configuredItems.length > 0) {
        return configuredItems;
    }

    return poolName === 'standard' ? DEFAULT_SPIN_ITEMS : [];
}
