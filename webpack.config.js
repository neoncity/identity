const path = require('path');

module.exports = {
    target: 'node',
    entry: {
        app: './src/app.js'
    },
    output: {
        path: path.resolve(__dirname, 'out'),
        filename: '[name].js'
    },
    module: {},
    resolve: {
        extensions: ['', '.js'],
        root: [
            path.resolve(__dirname, 'src')
        ]
    },
    devtool: 'source-map'
}
