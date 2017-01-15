const failPlugin = require('webpack-fail-plugin');
const path = require('path');
const webpack = require('webpack');

module.exports = {
    target: 'node',
    entry: {
        app: './src/app.ts',
        tests: './tests/app.ts',
    },
    output: {
        path: path.resolve(__dirname, 'out'),
        filename: '[name].js'
    },
    module: {
        loaders: [{
            test: /\.ts$/,
            include: [
                path.resolve(__dirname, 'src'),
                path.resolve(__dirname, 'tests')
            ],
            loader: 'ts',
            query: {
                configFileName: 'tsconfig.json',
                silent: true
            }
        }, {
	    test: /\.(json)$/,
	    include: [
		path.resolve(__dirname, 'src'),
		path.resolve(__dirname, 'node_modules')
	    ],
	    loader: 'json'
	}],
    },
    resolve: {
        extensions: ['', '.js', '.ts'],
        root: [
            path.resolve(__dirname, 'src'),
            path.resolve(__dirname, 'tests')
        ]
    },
    plugins: [
        failPlugin,
        new webpack.IgnorePlugin(/vertx/),
        // new webpack.IgnorePlugin(/\/iconv-loader$/)
    ],
    devtool: 'source-map'
}
