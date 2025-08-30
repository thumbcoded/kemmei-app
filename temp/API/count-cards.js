// count-cards.js
// Usage: node count-cards.js api_cards_test.json

const fs = require('fs');

if (process.argv.length < 3) {
  console.error('Usage: node count-cards.js <jsonfile>');
  process.exit(1);
}

const file = process.argv[2];
const data = fs.readFileSync(file, 'utf8');
let arr;
try {
  arr = JSON.parse(data);
} catch (e) {
  console.error('Could not parse JSON:', e.message);
  process.exit(1);
}

if (Array.isArray(arr)) {
  console.log('Card count:', arr.length);
} else {
  console.log('Not an array.');
}
