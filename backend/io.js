const {
    Server: socketIo
} = require('socket.io')


const io = new socketIo({
    cors: ['*'],
})

io.on('connect', socket => {
    console.log(`Socket connected: ${socket.id}`)

    socket.on('data', (cb) => cb('Hello From Socket'))
    socket.on('disconnect', () => {
        console.log(`Socket disocnnected: ${socket.id}`)
    })
})

module.exports = io