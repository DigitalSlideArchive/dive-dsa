import axios_, { Axios, AxiosInstance } from 'axios';
import cookies from 'js-cookie';
import { stringify } from 'qs';

export interface GirderRestClientParams {
    apiRoot: string;
    token?: string;
    axios?: AxiosInstance;
    authenticateWithCredentials?: boolean;
    userGirderAuthorizationHeader?: boolean;
    setLocalCookie?: boolean;
  }


const GirderTokenLength = 64;
export const OauthTokenPrefix = '#girderToken=';
export const OauthTokenSuffix = '__';

// Girder's custom headers
const GirderToken = 'Girder-Token';
const GirderOtp = 'Girder-OTP';
const GirderAuthorization = 'Girder-Authorization';

function setCookieFromAuth(auth: {token: string, expires: Date}) {
  cookies.set('girderToken', auth.token, { expires: new Date(auth.expires) });
}

/**
 * set cookie if special string is found in the hash.
 * @param {Location} location
 */
function setCookieFromHash(location: {hash: string,}) {
  const arr = location.hash.split(OauthTokenPrefix);
  const token = arr[arr.length - 1].split(OauthTokenSuffix)[0];
  if (token.length === GirderTokenLength) {
    const expires = new Date();
    expires.setDate((new Date()).getDate() + 365);
    setCookieFromAuth({ token, expires });
    location.hash = location.hash.replace(`${OauthTokenPrefix}${token}${OauthTokenSuffix}`, '');
  }
  return token;
}

/**
 * This is a subclass of axios that is meant to add Girder-specific helper functionality.
 */
export default class RestClient extends Axios {
  apiRoot: string;
  token: string | null;
  axios: AxiosInstance;
  authenticateWithCredentials: boolean;
  useGirderAuthorizationHeader: boolean;
  setLocalCookie: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: null | any;
  // eslint-disable-next-line @typescript-eslint/ban-types
  $on: Function | undefined;

  constructor({
    apiRoot = '/api/v1',
    token = window.localStorage.getItem('girderToken') || cookies.get('girderToken') || setCookieFromHash(window.location),
    axios = axios_.create(),
    authenticateWithCredentials = false,
    useGirderAuthorizationHeader = false,
    setLocalCookie = false,
  } = {}) {
    super({
      data: {
        user: null,
        token,
      },
    });
    this.apiRoot = apiRoot;
    this.axios = axios;
    this.token = token;
    this.authenticateWithCredentials = authenticateWithCredentials;
    this.useGirderAuthorizationHeader = useGirderAuthorizationHeader;
    this.setLocalCookie = setLocalCookie;

    Object.assign(this, axios, {
      apiRoot,
      setLocalCookie,
      authenticateWithCredentials,
      useGirderAuthorizationHeader,
    });
    this.interceptors.request.use((config) => {
        config.baseURL = this.apiRoot;
        config.headers[GirderToken] = this.token;
        return config;
    })
  }

  async login(username: string, password: string, otp = null) {
    try {
      await this.logout();
    } catch (err) {
      // noop
    }

    let auth;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const headers: Record<string, any> = {
      [GirderToken]: null,
    };
    if (this.useGirderAuthorizationHeader) {
      headers[GirderAuthorization] = `Basic ${window.btoa(`${username}:${password}`)}`;
    } else {
      auth = {
        username,
        password,
      };
    }
    if (otp) {
      headers[GirderOtp] = otp;
    }

    const resp = await this.get('user/authentication', {
      headers, auth, withCredentials: this.authenticateWithCredentials,
    });
    this.token = resp.data.authToken.token;
    this.user = resp.data.user;

    if (this.setLocalCookie) {
      setCookieFromAuth(resp.data.authToken);
    }
    return resp;
  }

  async logout() {
    if (!this.token) {
      return;
    }
    try {
      await this.delete('user/authentication');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err.response.status !== 401) {
        throw err;
      }
    } finally {
      this.token = null;
      this.user = null;
      cookies.remove('girderToken');
    }
  }

  async fetchUser() {
    const resp = await this.get('user/me');
    this.user = resp.data;
    if (this.user === null) {
      this.token = null;
    }
    return this.user;
  }

  async register(login: string, email: string, firstName: string, lastName: string, password: string, admin = false) {
    const resp = await this.post('user', stringify({
      login, email, firstName, lastName, password, admin,
    }));
    if (!resp.data.authToken) {
      return resp;
    }
    this.token = resp.data.authToken.token;
    this.user = resp.data;
    if (this.setLocalCookie) {
      setCookieFromAuth(resp.data.authToken);
    }
    return resp;
  }
}