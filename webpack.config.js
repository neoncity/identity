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
    externals: {
	// Introduced by knex. If you look in ./node_modules/knex/lib/dialects/sqlite3/ you can see
	// there's a hard require('sqlite3'). Similarly for all other knex drivers. However, this is
	// only needed when we're actually using sqlite3 and it can only work when the sqlite3
	// driver is installed. Since we're only using PostgreSQL, we need to tell Webpack to
	// treat the other drivers as "externals". Just map them to a supposed global variable, as a
	// default, for now.
	'sqlite3': 'sqlite3',
	'mariasql': 'mariasql',
	'mssql': 'mssql',
	'mysql': 'mysql',
	'mysql2': 'mysql2',
	'oracle': 'oracle',
	'oracledb': 'oracledb',
	'strong-oracle': 'strong-oracle',
	'pg-native': 'pg-native',
	'pg-query-stream': 'pg-query-stream'
    },
    plugins: [
        failPlugin,
        new webpack.IgnorePlugin(/vertx/), // From isomorphic-fetch
        new webpack.IgnorePlugin(/LICENSE/), // From express
        new webpack.IgnorePlugin(/template.html/), // From express
        new webpack.IgnorePlugin(/[.]stub$/), // From knex
        // new webpack.IgnorePlugin(/\/iconv-loader$/),
    ],
    devtool: 'source-map'
}
