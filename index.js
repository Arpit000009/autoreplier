// index.js
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Facebook credentials
const APP_ID = process.env.FB_APP_ID;
const APP_SECRET = process.env.FB_APP_SECRET;
const REDIRECT_URI = 'http://localhost:3000/auth/facebook/callback';

let userToken = '';
let pages = [];

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'your_secret',
  resave: false,
  saveUninitialized: true
}));

// ROUTES

// Homepage
app.get('/', (req, res) => {
  res.render('index');
});

// Login view
app.get('/login', (req, res) => {
  res.render('login');
});

// Facebook Login Redirect
app.get('/auth/facebook', (req, res) => {
  const url = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${APP_ID}&redirect_uri=${REDIRECT_URI}&scope=pages_show_list,pages_manage_posts,pages_read_engagement,pages_manage_engagement`;
  res.redirect(url);
});

// Facebook Callback
app.get('/auth/facebook/callback', async (req, res) => {
  const { code } = req.query;

  try {
    const tokenRes = await axios.get(`https://graph.facebook.com/v18.0/oauth/access_token`, {
      params: {
        client_id: APP_ID,
        client_secret: APP_SECRET,
        redirect_uri: REDIRECT_URI,
        code
      }
    });

    userToken = tokenRes.data.access_token;

    const pagesRes = await axios.get(`https://graph.facebook.com/v18.0/me/accounts`, {
      params: { access_token: userToken }
    });

    pages = pagesRes.data.data;
    req.session.isLoggedIn = true;
    res.redirect('/home');
  } catch (error) {
    console.error('Facebook callback error:', error.response?.data || error.message);
    res.redirect('/login');
  }
});

// Home view
app.get('/home', (req, res) => {
  if (!req.session.isLoggedIn) return res.redirect('/login');
  res.render('home', { pages });
});

// Get posts of a page
app.get('/posts/:pageId', async (req, res) => {
  const { pageId } = req.params;
  const page = pages.find(p => p.id === pageId);

  try {
    const postsRes = await axios.get(`https://graph.facebook.com/${pageId}/posts`, {
      params: { access_token: page.access_token }
    });
    res.json(postsRes.data.data);
  } catch (error) {
    console.error('Error fetching posts:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Reply to comments on a post (only if not already replied by this app)
app.post('/reply/:postId', async (req, res) => {
  const { postId } = req.params;
  const { message } = req.body;

  try {
    const pageId = postId.split('_')[0];
    const page = pages.find(p => p.id === pageId);

    if (!page) {
      return res.status(400).json({ error: 'Page not found for this post' });
    }

    // Get all comments
    const commentsRes = await axios.get(`https://graph.facebook.com/${postId}/comments`, {
      params: { access_token: page.access_token }
    });

    const comments = commentsRes.data.data;
    const replyTasks = [];

    for (const comment of comments) {
      // Check replies for each comment
      const repliesRes = await axios.get(`https://graph.facebook.com/${comment.id}/comments`, {
        params: { access_token: page.access_token }
      });

      const alreadyReplied = repliesRes.data.data.some(reply => reply.message === message);

      if (!alreadyReplied) {
        replyTasks.push(
          axios.post(`https://graph.facebook.com/${comment.id}/comments`, {
            message
          }, {
            params: { access_token: page.access_token }
          })
        );
      }
    }

    await Promise.all(replyTasks);

    res.json({ status: ' Replied to new comments only' });
  } catch (err) {
    console.error('Reply error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to reply to comments' });
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  userToken = '';
  pages = [];
  res.redirect('/login');
});

// Server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});