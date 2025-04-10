const path = require('path');

const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const cors = require('cors');

const driverScoreRoute = require('./routes/driverScore');

const PORT = 3010;

app.use(cors());
app.use(express.json())

app.use('/', driverScoreRoute);

app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
})
