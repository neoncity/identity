const fs = require('fs');

const x = fs.readFileSync('./out/coverage/coverage-remapped.json', 'utf-8');
const y = JSON.parse(x);

const o = {};

const re = new RegExp("^webpack:///src/.*[.]ts", "gi");

for (var k in y) {
    if (!re.test(k))
        continue;
    o[k] = y[k];
}

fs.writeFileSync('./out/coverage/coverage-filtered.json', JSON.stringify(o), 'utf-8');
