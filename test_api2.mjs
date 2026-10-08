import handler from './api/now-playing.js';
const res = {
  setHeader: (k, v) => console.log('setHeader', k, v),
  status: (c) => ({
    json: (d) => {
      console.log('STATUS:', c);
      console.log('JSON:', JSON.stringify(d, null, 2));
    }
  })
};
process.env.SPOTIFY_CLIENT_ID = '793130e4f3fb4c3d868518d9b1b7292a';
process.env.SPOTIFY_CLIENT_SECRET = 'cd596a1b3d3443a2976fdabc1b4afc1e';
process.env.SPOTIFY_REFRESH_TOKEN = 'AQCsT-cgHd0Z3BqTFStMOoR9zhX6mV8Wom2ciOsbRqYszn-sxdPX0cVu9MWjHgNqEHkJobQFMKUSHS4fHIBQhpzMF63kAMwKrVebdkrkezRPp3znCs_JdA_Xi715p4138Hg';
handler({}, res).catch(console.error);
