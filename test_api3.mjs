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
console.log('TOKEN RES:', data);
if (!data.access_token) process.exit(1);

const auth = { Authorization: 'Bearer ' + data.access_token };
console.log('Fetching /v1/me/player...');
const now = await fetch('https://api.spotify.com/v1/me/player', { headers: auth });
console.log('PLAYER STATUS:', now.status);
if (now.status === 200) {
  const d = await now.json();
  console.log('PLAYER JSON:', JSON.stringify(d).substring(0, 200));
}

console.log('Fetching recently-played...');
const recent = await fetch(
  'https://api.spotify.com/v1/me/player/recently-played?limit=1',
  { headers: auth }
);
console.log('RECENT STATUS:', recent.status);
if (recent.status === 200) {
  const r = await recent.json();
  console.log('RECENT JSON:', JSON.stringify(r).substring(0, 200));
}
