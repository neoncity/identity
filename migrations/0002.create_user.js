exports.up = (knex, Promise) => knex.schema.raw(`
    CREATE TYPE Role AS ENUM ('regular', 'admin');

    CREATE TABLE identity.user (
	id Serial PRIMARY KEY,
	time_created Timestamp NOT NULL,
	time_last_updated Timestamp NOT NULL,
	time_removed Timestamp NULL,
	role Role NOT NULL,
	auth0_user_id_hash Char(64) NOT NULL,
	PRIMARY KEY (id)
    );

    CREATE UNIQUE INDEX user_auth0_user_id_hash ON identity.user(auth0_user_id_hash);
`);

exports.down = (knex, Promise) => knex.schema.raw(`
    DROP INDEX IF EXISTS identity.user_auth0_user_id_hash;
    DROP TABLE IF EXISTS identity.user;
    DROP TYPE identity.Role;
`);
