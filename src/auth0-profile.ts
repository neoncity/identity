import * as r from 'raynor'
import { MarshalWith } from 'raynor'


export class Auth0Profile {
    @MarshalWith(r.StringMarshaller)
    name: string;

    @MarshalWith(r.SecureWebUriMarshaller)
    picture: string;

    @MarshalWith(r.StringMarshaller, 'user_id')
    userId: string;
}