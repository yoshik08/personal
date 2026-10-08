const SPOTIFY_CLIENT_ID = '793130e4f3fb4c3d868518d9b1b7292a';
const SPOTIFY_CLIENT_SECRET = 'cd596a1b3d3443a2976fdabc1b4afc1e';
const SPOTIFY_REFRESH_TOKEN = 'AQCsT-cgHd0Z3BqTFStMOoR9zhX6mV8Wom2ciOsbRqYszn-sxdPX0cVu9MWjHgNqEHkJobQFMKUSHS4fHIBQhpzMF63kAMwKrVebdkrkezRPp3znCs_JdA_Xi715p4138Hg';

const basic = Buffer.from(
  SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET
).toString('base64');

const tok = await fetch('https://accounts.spotify.com/api/token', {
  method: 'POST',
  headers: {
    Authorization: 'Basic ' + basic,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: SPOTIFY_REFRESH_TOKEN,
  }),
});
const data = await tok.json();
const auth = { Authorization: 'Bearer ' + data.access_token };

let now = await fetch('https://api.spotify.com/v1/me/player', { headers: auth });
if (now.status === 401 || now.status === 403) {
  console.log('/v1/me/player failed with', now.status, '- trying currently-playing');
  now = await fetch('https://api.spotify.com/v1/me/player/currently-playing', { headers: auth });
}
console.log('FINAL STATUS:', now.status);
if (now.status === 200) {
  const d = await now.json();
  console.log('TITLE:', d.item ? d.item.name : 'no item');
} else if (now.status === 204) {
  console.log('204 No Content');
}

