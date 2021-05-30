const express = require('express');
const path = require('path');
const hbs = require('express-handlebars');

const PORT = process.env.PORT || 8000;

const app = express();
app.enable('trust proxy');

app.engine('hbs', hbs({
    extname: 'hbs',
    defaultLayout: 'main',
    layoutsDir: __dirname + '/views/layouts/'
}));

app.set('view engine', 'hbs');
app.use('/css', express.static(path.join(__dirname, 'node_modules/bootstrap/dist/css')));

app.use('/', require('./routes/routes'));

app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
});