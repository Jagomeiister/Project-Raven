const fs = require('fs');
const path = require('path');
const { loadBannedWords, splitResponse } = require('../modules/utils');

describe('loadBannedWords', () => {
  test('returns empty array when file is missing', async () => {
    const words = await loadBannedWords('nonexistent.txt');
    expect(words).toEqual([]);
  });

  test('loads and trims words from file', async () => {
    const tmp = path.join(__dirname, 'temp_badwords.txt');
    fs.writeFileSync(tmp, ' Foo \nBar\n\nbaz ');
    const words = await loadBannedWords(tmp);
    fs.unlinkSync(tmp);
    expect(words).toEqual(['foo', 'bar', 'baz']);
  });

  test('handles comment lines and unusual whitespace', async () => {
    const tmp = path.join(__dirname, 'temp_badwords_comments.txt');
    fs.writeFileSync(
      tmp,
      '# comment\nfoo\n    # Another Comment\n   Bar  \n\tbaz\t\n'
    );
    const words = await loadBannedWords(tmp);
    fs.unlinkSync(tmp);
    expect(words).toEqual([
      '# comment',
      'foo',
      '# another comment',
      'bar',
      'baz',
    ]);
  });
});

describe('splitResponse', () => {
  test('returns original string if under max length', () => {
    const parts = splitResponse('hello world', 20);
    expect(parts).toEqual(['hello world']);
  });

  test('trims trailing spaces in input', () => {
    const parts = splitResponse('hello world   ', 20);
    expect(parts).toEqual(['hello world']);
  });

  test('splits long string at spaces', () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    const parts = splitResponse(text, 10);
    expect(parts).toEqual(['The quick', 'brown fox', 'jumps over', 'the lazy', 'dog']);
  });

  test('splits strings with no spaces', () => {
    const text = 'abcdefghijklmnopqrstuvwxyz';
    const parts = splitResponse(text, 10);
    expect(parts).toEqual(['abcdefghij', 'klmnopqrst', 'uvwxyz']);
  });
});
