const http = require('http')

const app = require('./app')
const io = require('./io')


const server = http.createServer()

server.on('request', app)
io.attach(server)

server.listen(process.env.PORT, (err) => err ? console.log(err) : console.log(`Server started: http://localhost:${process.env.PORT}`))