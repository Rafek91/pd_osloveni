const express = require('express')
const cors = require('cors')
const functions = require('firebase-functions')

const app = express()

app.get('/', (req, res) => {
    res.send('Ahoj')
})

exports.app = functions.https.onRequest(app)
