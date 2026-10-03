# yoshik.xyz — personal site

minimal personal site in the ramx.in style. static html/css/js + one vercel
serverless function for spotify.

## deploy (5 min)

1. push this folder to a new github repo (e.g. `yoshik08/yoshik.xyz`)
2. import it in vercel → deploy. you get `yoshik-xyz.vercel.app`
3. in godaddy dns for yoshik.xyz:
   - A record @ → 76.76.21.21
   - CNAME www → cname.vercel-dns.com
4. in vercel project settings → domains → add `yoshik.xyz` and `www.yoshik.xyz`

## spotify widget (5 min, one time)

1. https://developer.spotify.com/dashboard → create app
2. set redirect uri to `http://localhost:3000/callback`
3. note client id + client secret
4. get a refresh token (open this in browser, replace IDs):
   `https://accounts.spotify.com/authorize?client_id=ID&response_type=code&redirect_uri=http://localhost:3000/callback&scope=user-read-currently-playing%20user-read-recently-played`
   approve → copy the `code` from the redirected url → exchange it:
   ```
   curl -X POST https://accounts.spotify.com/api/token \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=authorization_code&code=CODE&redirect_uri=http://localhost:3000/callback&client_id=ID&client_secret=SECRET"
   ```
   keep the `refresh_token` from the response
5. vercel project → settings → environment variables, add:
   - SPOTIFY_CLIENT_ID
   - SPOTIFY_CLIENT_SECRET
   - SPOTIFY_REFRESH_TOKEN
6. redeploy. widget goes live.

## discord widget (2 min)

1. join https://discord.gg/lanyard (their bot reads your presence)
2. discord settings → advanced → enable developer mode
3. right-click your own profile → copy user id
4. in `script.js` set `DISCORD_ID` and `DISCORD_USERNAME`

## photo

drop your photo at `assets/me.jpg` (square works best). without it a
gradient "Y" shows instead.
