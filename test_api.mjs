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

// Set env vars (fake or missing, it will return {})
// Wait, we need actual env vars to test if it's a Spotify error!
console.log('Testing handler...');
handler({}, res).catch(console.error);
