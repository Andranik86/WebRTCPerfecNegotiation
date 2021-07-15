/* 
    This is New WebRTC Spec Complient Implementation.
    Due to node-webrtc not complient with it, you cant use it.
*/

const path = require('path')
const fs = require('fs')

const {
    Server: socketIo
} = require('socket.io')
const {
    RTCPeerConnection,
    nonstandard: {
        RTCVideoSink,
    }
} = require('wrtc')

const { v4: uuidv4 } = require('uuid')


const io = new socketIo({
    cors: ['*'],
})

const ICE_SERVERS = [
    {
        urls: 'stun.l.google.com:19302'
    },
    {
        urls: 'stun2.l.google.com:19302'
    },
    {
        urls: 'stun3.l.google.com:19302'
    },
    {
        urls: 'stun4.l.google.com:19302'
    }
]

const peerInfoList = []
const defaultPoliteValue = false

io.on('connect', socket => {
    console.log(`Socket connected: ${socket.id}`)

    socket.on('description', async ({ uuid, description }) => {
        const peerInfo = peerInfoList.find(peerInfo => peerInfo.uuid === uuid)
        const { polite, makingOffer, peer, completeIceGathering } = peerInfo
        const signalingState = peer.signalingState

        const offerCollision = (description === 'offer') &&
            (makingOffer || signalingState !== 'stable')
        const ignoreOffer = !polite && offerCollision

        if (ignoreOffer) return

        await peer.setRemoteDescription(description)
        if (description.type === 'offer') {
            await Promise.all([
                completeIceGathering(),
                peer.setLocalDescription()
            ])
            socket.emit('description', { description: peer.localDescription })
        }
    })

    socket.on('getUUID', (cb) => {
        console.log('getUUid')

        const peerInfo = {
            uuid: uuidv4(),
            peer: new RTCPeerConnection({iceServers: ICE_SERVERS}),
            polite: defaultPoliteValue,

            makingOffer: false,
            signalingState: 'new',
            completeIceGathering() {
                const peer = peerInfo.peer
                const observer = createObserver()

                const iceGatheringStateChangeHandler = (e) => {
                    if (peer.iceGatheringState === 'complete') {
                        peer.removeEventListener('icegatheringstatechange', iceGatheringStateChangeHandler)
                        return observer.res()
                    }
                }
                peer.addEventListener('icegatheringstatechange', iceGatheringStateChangeHandler)
                return observer.promise
            }
        }
        const peer = peerInfo.peer
        const completeIceGathering = peerInfo.completeIceGathering
        peer.addEventListener('negotiationneeded', async (e) => {
            peerInfo.makingOffer = true
            try {
                await Promise.all([
                    peer.setLocalDescription(),
                    completeIceGathering()
                ])
            } catch (err) {
                return console.log('Negotiation Needed Faile: Server')
            }
            socket.emit('description', { uuid: peerInfo.uuid, description: peer.localDescription })
            peerInfo.makingOffer = false
        })
        peer.addEventListener('iceconnectionstatechange', (e) => {
            switch (peer.iceConnectionState) {
                case 'failed':
                    peer.close()
                    break
                case 'closed':
                    const index = peerInfoList.findIndex(currPeerInfo => currPeerInfo.uuid !== peerInfo.uuid)
                    if (index !== -1) {
                        peerInfoList.splice(index, 1)
                    }
            }
        })

        peerInfoList.push(peerInfo)
        cb({ uuid: peerInfo.uuid })
    })

    socket.on('disconnect', () => {
        console.log(`Socket disocnnected: ${socket.id}`)
    })
})

module.exports = io

function createObserver() {
    const observer = {
        res: null,
        rej: null,
        promise: null,
    }
    observer.promise = new Promise((res, rej) => {
        observer.res = res
        observer.rej = rej
    })
    return observer
}