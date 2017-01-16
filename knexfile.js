module.exports = {
    development: {
	client: 'pg',
	connection: process.env.DATABASE_URL,
	pool: {
	    min: 2,
	    max: 10
	},
	migrations: {
	    directory: './migrations',
	    tableName: 'migrations_identity'
	}
    }
}
