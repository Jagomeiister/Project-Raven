const fs = require('fs/promises');
const path = require('path');

const loadBannedWords = async (filePath) => {
    let banned_words = [];
    if (filePath) {
        try {
            await fs.access(filePath);
            const data = await fs.readFile(filePath, 'utf-8');
            banned_words = data
                .split('\n')
                .map(word => word.trim().toLowerCase())
                .filter(word => word.length > 0);
        } catch {
            // file does not exist; return empty array
        }
    }
    return banned_words;
};

const splitResponse = (response, max_length = 200) => {
    const parts = [];
    response = response.trim();
    while (response.length > max_length) {
        let split_at = response.lastIndexOf(' ', max_length);
        if (split_at === -1) split_at = max_length;
        parts.push(response.substring(0, split_at).trim());
        response = response.substring(split_at).trim();
    }
    if (response.length > 0) parts.push(response.trim());
    return parts;
};

module.exports = { loadBannedWords, splitResponse };
