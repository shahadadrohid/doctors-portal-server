const express = require('express');
const cors = require('cors');
require(dotenv).config();

const app = express();
const port = process.env.PORT || 5000;

// MiddleWare 
app.use(cors())
app.use(express.json())

app.get('/', () => {
    res.send('Running Doctors portal Server')
})
app.listen(port, () => {
    console.log(`Doctors portal listening on port ${port}`)
})