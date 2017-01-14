const path = require('path');
const failPlugin = require('webpack-fail-plugin');

module.exports = {
    target: 'node',
    entry: {
        app: './src/app.ts'
    },
    output: {
        path: path.resolve(__dirname, 'out'),
        filename: '[name].js'
    },
    module: {
        loaders: [{
            test: /\.ts$/,
            include: [path.resolve(__dirname, 'src')],
            loader: 'ts',
            query: {
                configFileName: 'tsconfig.json',
                silent: true
            }
        }],
    },
    resolve: {
        extensions: ['', '.js', '.ts'],
        root: [
            path.resolve(__dirname, 'src')
        ]
    },
    plugins: [
        failPlugin
    ],
    devtool: 'source-map'
}
