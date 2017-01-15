const fs = require('fs');

const x = fs.readFileSync('./out/coverage/coverage-remapped.json', 'utf-8');
const y = JSON.parse(x);

const o = {};

const re = new RegExp("^webpack://(/src/.*[.]ts)", "gi");

for (var k in y) {
    const m = re.exec(k);
    if (m == null)
        continue;
    o[m[1]] = y[k];
}

fs.writeFileSync('./out/coverage/coverage-filtered.json', JSON.stringify(o), 'utf-8');
