import * as crypto from 'crypto'
import * as r from 'raynor'
import { MarshalWith } from 'raynor'

import { LanguageFromLocaleMarshaller } from '@neoncity/common-js'


export class Auth0Profile {
    @MarshalWith(r.StringMarshaller)
    name: string;

    @MarshalWith(r.SecureWebUriMarshaller)
    picture: string;

    @MarshalWith(r.StringMarshaller, 'user_id')
    userId: string;

    @MarshalWith(LanguageFromLocaleMarshaller, 'locale')
    language: string;

    getUserIdHash(): string {
	const sha256hash = crypto.createHash('sha256');
	sha256hash.update(this.userId);
	return sha256hash.digest('hex');	
    }
}
