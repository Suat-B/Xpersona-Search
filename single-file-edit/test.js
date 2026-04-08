const { formatName } = require('./index.js');

console.log('Test 1 - Empty string:', formatName(''));
console.log('Test 2 - Whitespace only:', formatName('   '));
console.log('Test 3 - Single word lowercase:', formatName('john'));
console.log('Test 4 - Single word uppercase:', formatName('JOHN'));
console.log('Test 5 - Multiple words mixed case with extra spaces:', formatName('  john   doe  '));
console.log('Test 6 - Multiple words with extra spaces:', formatName('jane   smith   doe'));
console.log('Test 7 - null input:', formatName(null));
console.log('Test 8 - undefined input:', formatName(undefined));
console.log('Test 9 - Number input:', formatName(123));
console.log('Test 10 - Object input:', formatName({}));
console.log('Test 11 - Single word with hyphen:', formatName('mary-jane'));
console.log('Test 12 - Single word with apostrophe:', formatName("o'reilly"));
console.log('Test 13 - Non-English characters:', formatName('josé García'));
console.log('Test 14 - Mixed case with numbers:', formatName('john doe 123'));
