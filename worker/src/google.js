const TOKEN_ADDRESS = 'https://oauth2.googleapis.com/token';

async function tokenRequest(fields) {
  const response = await fetch(TOKEN_ADDRESS, { method: 'POST', body: new URLSearchParams(fields) });
  const body = await response.json();
  if (!response.ok) throw new Error(`Google sign-in failed: ${body.error_description ?? body.error}`);
  return body;
}

export function exchangeAuthorizationCode(code, environment) {
  return tokenRequest({
    code,
    client_id: environment.GOOGLE_CLIENT_ID,
    client_secret: environment.GOOGLE_CLIENT_SECRET,
    redirect_uri: 'postmessage',
    grant_type: 'authorization_code',
  });
}

export async function accessTokenFromRefreshToken(refreshToken, environment) {
  const body = await tokenRequest({
    refresh_token: refreshToken,
    client_id: environment.GOOGLE_CLIENT_ID,
    client_secret: environment.GOOGLE_CLIENT_SECRET,
    grant_type: 'refresh_token',
  });
  return body.access_token;
}
