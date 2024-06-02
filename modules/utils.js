const fs = require('fs');
const path = require('path');

const loadBannedWords = (filePath) => {
    let banned_words = [];
    if (filePath && fs.existsSync(filePath)) {
        banned_words = fs.readFileSync(filePath, 'utf-8')
            .split('\n')
            .map(word => word.trim().toLowerCase())
            .filter(word => word.length > 0);
    }
    return banned_words;
};

const splitResponse = (response, max_length = 200) => {
    const parts = [];
    while (response.length > max_length) {
        let split_at = response.lastIndexOf(' ', max_length);
        if (split_at === -1) split_at = max_length;
        parts.push(response.substring(0, split_at));
        response = response.substring(split_at).trim();
    }
    parts.push(response);
    return parts;
};

module.exports = { loadBannedWords, splitResponse };
