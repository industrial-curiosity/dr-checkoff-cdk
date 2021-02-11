const crypto = require("crypto");

console.log(`copy the following into the appropriate stack definition in lib/stacks.json:`);
console.log(crypto.randomBytes(64).toString('hex'));
