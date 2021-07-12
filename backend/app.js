const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')

const app = express()

app.use(cors())
app.use(bodyParser.json())

app.get('/', (req, res, next) => {
    res.send({
        data: 'Hello World'
    })
})

module.exports = app