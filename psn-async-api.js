const rp = require("request-promise").defaults({ jar: true });
const Cache = require("async-disk-cache");
const psnCache = new Cache("psn-cache");

// globals
const _CLIENT_ID = "ebee17ac-99fd-487c-9b1e-18ef50c39ab5",
  _SCOPE = `kamaji:get_players_met kamaji:get_account_hash kamaji:activity_feed_submit_feed_story kamaji:activity_feed_internal_feed_submit_story kamaji:activity_feed_get_news_feed kamaji:communities kamaji:game_list kamaji:ugc:distributor oauth:manage_device_usercodes psn:sceapp user:account.profile.get user:account.attributes.validate user:account.settings.privacy.get kamaji:activity_feed_set_feed_privacy kamaji:satchel kamaji:satchel_delete user:account.profile.update`,
  _DUID = "0000000d000400808F4B3AA3301B4945B2E3636E38C0DDFC",
  _REDIRECT_URI = "com.playstation.PlayStationApp://redirect",
  _CLIENT_SECRET = "e4Ru_s*LrL4_B2BD";

// globals holding urls
const _SSO_URL = "https://auth.api.sonyentertainmentnetwork.com/2.0/ssocookie",
  _CODE_URL =
    "https://auth.api.sonyentertainmentnetwork.com/2.0/oauth/authorize",
  _OAUTH_URL = "https://auth.api.sonyentertainmentnetwork.com/2.0/oauth/token";

/**
 * IMPORTANT: this should be a one time action, run it only once to get npsso and then use it
 * Sends request to endpoint to retrieve npsso token needed to continue logging in using 2FA
 * @param {string} login_token - the login token copied from the url as instructed
 * @param {string} code - the code gotten to the phone from the psn two auth service
 */
getCookie = async (login_token, code) => {
  let resp;
  const login_request = {
    authentication_type: "two_step",
    ticket_uuid: login_token,
    code: code,
    client_id: _CLIENT_ID
  };
  const options = {
    method: "POST",
    uri: _SSO_URL,
    body: login_request,
    json: true
  };

  resp = await rp(options);
  psnCache.set("npsso", resp.npsso);
  return resp.npsso;
};

class PSNHandler {
  /**
   * Constructor
   * @param {string} npsso - The npsso token you get as a cookie
   * from running getCookie func correctly
   */
  constructor(npsso) {
    this.npsso = npsso;
  }

  /**
   *
   */
  async _getGrant() {
    let resp;
    if (!this.npsso) throw "No npsso found, run getCookie function first";
    const refresh_oauth_request = {
        duid: _DUID,
        client_id: _CLIENT_ID,
        response_type: "code",
        scope: _SCOPE,
        redirect_uri: _REDIRECT_URI
      },
      headers = {
        Cookie: "npsso=" + this.npsso
      },
      options = {
        method: "GET",
        uri: _CODE_URL,
        qs: refresh_oauth_request,
        followRedirect: false,
        resolveWithFullResponse: true,
        simple: false,
        headers: headers,
        json: true
      };
    resp = await rp(options);
    return resp.headers["x-np-grant-code"];
  }

  /**
   *
   */
  async _auth(grant) {
    let resp;

    const oauth_request = {
        client_id: _CLIENT_ID,
        client_secret: _CLIENT_SECRET,
        duid: _DUID,
        scope: _SCOPE,
        redirect_uri: _REDIRECT_URI,
        code: grant,
        grant_type: "authorization_code"
      },
      options = {
        method: "POST",
        uri: _OAUTH_URL,
        form: oauth_request,
        json: true,
        simple: false
      };
    resp = await rp(options);
    return resp;
  }

  /**
   *
   */
  async _refreshTokens() {
    const cacheRefreshToken = await psnCache.get("psn_refresh_token");
    if (cacheRefreshToken.value) {
      console.log("Refreshing PSN tokens");
      const refresh_token = cacheRefreshToken.value;
      const auth_data = {
          app_context: "inapp_ios",
          client_id: _CLIENT_ID,
          client_secret: _CLIENT_SECRET,
          refresh_token: refresh_token,
          duid: _DUID,
          grant_type: "refresh_token",
          scope: _SCOPE
        },
        options = {
          method: "POST",
          uri: _OAUTH_URL,
          form: auth_data,
          json: true,
          simple: false
        };
      const resp = await rp(options);
      await this._populateTokens(resp);
    } else {
      console.log("Creating PSN tokens");
      // if there is no refresh token, auth
      await psnCache.clear();
      const grant = await this._getGrant();
      const authResp = await this._auth(grant);
      await this._populateTokens(authResp);
    }
  }

  /**
   *
   */
  async _populateTokens(resp_with_tokens) {
    const access_token = resp_with_tokens.access_token,
      refresh_token = resp_with_tokens.refresh_token,
      expires_at =
        new Date().getTime() / 1000 + resp_with_tokens.expires_in - 100;
    await psnCache.set("psn_access_token", access_token);
    await psnCache.set("psn_refresh_token", refresh_token);
    await psnCache.set("psn_expires_at", expires_at);
  }

  /**
   *
   */
  async _isTokenExpired() {
    const cacheExpireTime = await psnCache.get("psn_expires_at");
    if (cacheExpireTime.value)
      return new Date().getTime() / 1000 > cacheExpireTime.value;
    return true;
  }

  /**
   * Retrieves psn user id for a certain username
   * @param {string} username - psn username to search for his id
   */
  async getUserIdPSN(username) {
    const cachePsuid = await psnCache.get("psuidForGamertag-" + username);
    if (cachePsuid.value) return cachePsuid.value;
    else {
      let cacheToken = await psnCache.get("psn_access_token");
      if (!cacheToken.value || (await this._isTokenExpired())) {
        await this._refreshTokens();
        cacheToken = await psnCache.get("psn_access_token");
      }
      const access_token = cacheToken.value,
        headers = { Authorization: `Bearer ${access_token}` },
        uri = `https://us-prof.np.community.playstation.net/userProfile/v1/users/${username}/profile2?fields=onlineId,accountId,avatarUrls&avatarSizes=xl&profilePictureSizes=m,xl&psVitaTitleIcon=circled%26titleIconSize=s`;
      const resp = await rp({ uri, headers, json: true });
      psnCache.set("psuidForGamertag-" + username, resp.profile.accountId);
      return resp.profile.accountId;
    }
  }
}

