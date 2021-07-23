const path = require('path')

const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')

const app = express()

app.use(cors({
    origin:  ['https://e754bb56af4e.ngrok.io', 'https://f7a84800a675.ngrok.io', '*',]
}))
app.use(bodyParser.json())
app.use(express.static(path.join(__dirname, './build')))

app.get('/', (req, res, next) => {
    res.send({
        data: 'Hello World'
    })
})

module.exports = app