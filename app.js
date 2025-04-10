const path = require('path');

const express = require('express');
const bodyParser = require('body-parser');
const app = express();

const driverScoreRoute = require('./routes/driverScore');
app.use(express.json())
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', driverScoreRoute);
