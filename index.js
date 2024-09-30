require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const spotifyWebApi = require('spotify-web-api-node');

const pg = require("pg");
const app = express();
const PORT =  3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static("public"));

//Database connection 
const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "Muse",
  password: "Priya@26",
  port: 5432,
});
db.connect();

//Spotify integration
const spotifyApp = new spotifyWebApi({
  clientId:process.env.CLIENT_ID,
  clientSecret:process.env.CLIENT_SECRET,
  redirectUri:process.env.REDIRECT_URL
});
let songs = [];
let userDetail = [];
//get requests
app.get('/', (req, res) => {
  res.render('login',{"error":''});
});

app.get('/login', (req, res) => {
  res.render('login',{"error":''});
});

app.get('/home', (req, res) => {
  const scopes = ['user-read-private', 'user-read-email', 'user-read-playback-state', 'user-modify-playback-state'];
    // Redirect the client to Spotify's authorization page with the defined scopes.
    res.redirect(spotifyApp.createAuthorizeURL(scopes));
});
// Route handler for the callback endpoint after the user has logged in.
app.get('/callback', async (req, res) => {
  // Extract the error, code, and state from the query parameters.
  const error = req.query.error;
  const code = req.query.code;

  // If there is an error, log it and send a response to the user.
  if (error) {
    console.error('Callback Error:', error);
    res.send(`Callback Error: ${error}`);
    return;
  }

  try {
    // Exchange the code for an access token and a refresh token.
    const data = await spotifyApp.authorizationCodeGrant(code);
    const accessToken = data.body['access_token'];
    const refreshToken = data.body['refresh_token'];
    const expiresIn = data.body['expires_in'];

    // Set the access token and refresh token on the Spotify API object.
    spotifyApp.setAccessToken(accessToken);
    spotifyApp.setRefreshToken(refreshToken);
    // Logging tokens can be a security risk; this should be avoided in production.
    try {
      
      const { body: { items} } = await spotifyApp.getPlaylistTracks('37i9dQZF1DWXVJK4aT7pmk');
      // Now 'items' contains an array of track objects
      songs =items;
      res.redirect('/songs');
    } catch (error) {
      console.error('Error:', error);
      res.status(500).send('An error occurred while fetching songs');
    }
    // Refresh the access token periodically before it expires.
    setInterval(async () => {
      const data = await spotifyApp.refreshAccessToken();
      const accessTokenRefreshed = data.body['access_token'];
      spotifyApp.setAccessToken(accessTokenRefreshed);
    }, expiresIn / 2 * 1000); // Refresh halfway before expiration.
  } catch (error) {
    console.error('Error:', error);
    res.send('An error occurred');
  }
});
app.get('/songs', async (req,res) =>{
  try{
    res.render('home',{songs:songs});

  }catch (err){
    console.log(err);
  }
});

// Route handler for the search endpoint.
app.get('/search', (req, res) => {
  // Extract the search query parameter.
  const { q } = req.query;

  // Make a call to Spotify's search API with the provided query.
  spotifyApp.searchTracks(q).then(searchData => {
      // Extract the URI of the first track from the search results.
      const trackUri = searchData.body.tracks.items[0].uri;
      // Send the track URI back to the client.
      res.send({ uri: trackUri });
  }).catch(err => {
      console.error('Search Error:', err);
      res.send('Error occurred during search');
  });
});

// Route handler for the play endpoint.
app.get('/play', (req, res) => {
  // Extract the track URI from the query parameters.
  const { uri } = req.query;

  // Send a request to Spotify to start playback of the track with the given URI.
  spotifyApp.play({ uris: [uri] }).then(() => {
      res.send('Playback started');
  }).catch(err => {
      console.error('Play Error:', err);
      res.send('Error occurred during playback');
  });
});


//post requests
app.post('/login', async (req, res) => {
  try{
    const password = req.body.password;
    const email = req.body.email;
    const userResult = await db.query("SELECT * FROM users WHERE email = $1",[
      email
    ]);
    console.log("user:",userResult.rows);
    if(userResult.rows.length > 0){
      storedPassword = userResult.rows[0].password;
      console.log("storedPassword:",storedPassword,"password:",password);
      if(storedPassword === password){
        userDetail = userResult.rows[0];
        res.redirect("/home");
      }
      else{
        return res.render("login", {
          checkedBlock:"register",
          errorMessage: "No user found ! Please register.",
        });
      }
    }
  
  }catch (err){
    console.log(err);
  }

  
});
//signup  
app.post('/signUp', async (req, res) => {
  try {
    const name = req.body.name;
    const username = req.body.username;
    const password = req.body.password;
    const email = req.body.email;
    //form validation
    if (password.length < 8) {
      return res.render("login", {
        checkedBlock:"register",
        passwordError: "Password must be at least 8 characters long.",
      });
    }

    // Basic email validation using regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.render("login", {
        checkedBlock:"register",
        emailError: "Invalid email address.",
      });
    }

    userDetail = await db.query(
      "INSERT INTO users (name,username,password,email) VALUES ($1,$2,$3,$4) returning *",
      [name,username,password,email]
    );
    res.redirect("/home");
  } catch (err) {
    console.log(err);
  }
    
});


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
