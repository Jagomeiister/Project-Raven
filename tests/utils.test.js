const fs = require('fs');
const path = require('path');
const { loadBannedWords, splitResponse } = require('../modules/utils');

describe('loadBannedWords', () => {
  test('returns empty array when file is missing', () => {
    const words = loadBannedWords('nonexistent.txt');
    expect(words).toEqual([]);
  });

  test('loads and trims words from file', () => {
    const tmp = path.join(__dirname, 'temp_badwords.txt');
    fs.writeFileSync(tmp, ' Foo \nBar\n\nbaz ');
    const words = loadBannedWords(tmp);
    fs.unlinkSync(tmp);
    expect(words).toEqual(['foo', 'bar', 'baz']);
  });
});

describe('splitResponse', () => {
  test('returns original string if under max length', () => {
    const parts = splitResponse('hello world', 20);
    expect(parts).toEqual(['hello world']);
  });

  test('splits long string at spaces', () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    const parts = splitResponse(text, 10);
    expect(parts).toEqual(['The quick', 'brown fox', 'jumps over', 'the lazy', 'dog']);
  });
});
