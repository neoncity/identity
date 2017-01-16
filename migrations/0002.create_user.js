exports.up = (knex, Promise) => knex.schema.raw(`
    CREATE TABLE identity.user (
	id SERIAL,
	auth0_user_id_hash CHAR(64) NOT NULL,
	time_joined TIMESTAMP NOT NULL,
	PRIMARY KEY (id)
    );

    CREATE UNIQUE INDEX user_auth0_user_id_hash ON identity.user(auth0_user_id_hash);
`);

exports.down = (knex, Promise) => knex.schema.raw(`
    DROP INDEX IF EXISTS identity.user_auth0_user_id_hash;
    DROP TABLE IF EXISTS identity.user;
`);
