const path = require('path')
const fs = require('fs')

const {
    Server: socketIo
} = require('socket.io')
const {
    RTCPeerConnection,
    RTCSessionDescription,
    RTCIceCandidate,
    nonstandard: {
        RTCVideoSink,
    }
} = require('wrtc')

const { v4: uuidv4 } = require('uuid')


const io = new socketIo({
    cors: ['*'],
})

const MEDIA_DIR = path.join(__dirname, '../media')

const peerInfoMap = {}
let lastPeerIndex = -1

const ICE_SERVERS = [
    {
        urls: 'stun:stun.l.google.com:19302'
    },
    {
        urls: 'stun:stun2.l.google.com:19302'
    },
    {
        urls: 'stun:stun3.l.google.com:19302'
    },
    {
        urls: 'stun:stun4.l.google.com:19302'
    }
]

const peerInfoList = []
const defaultPoliteValue = false

io.on('connect', socket => {
    console.log(`Socket connected: ${socket.id}`)

    socket.on('description', async ({ uuid, description }) => {
        const peerInfo = peerInfoList.find(peerInfo => peerInfo.uuid === uuid)
        const {
            polite,
            makingOffer,
            peer,
            completeIceGathering,
        } = peerInfo
        console.log(peer.signalingState)

        const signalingState = peer.signalingState

        const offerCollision = (description === 'offer') &&
            (makingOffer || signalingState !== 'stable')
        const ignoreOffer = !polite && offerCollision

        if (ignoreOffer) return

        if (offerCollision) {
            await Promise.all([
                peer.setLocalDescription({ type: 'rollback' }),
                peer.setRemoteDescription(description)
            ])
        } else {
            console.log(peer.signalingState)
            await peer.setRemoteDescription(description)
        }
        const iceGatheringPromise = completeIceGathering()
        console.log('asas')

        if (description.type === 'offer') {
            const answer = await peer.createAnswer()
            await Promise.all([
                iceGatheringPromise,
                peer.setLocalDescription(answer)
            ])
            socket.emit('description', { description: peer.localDescription })
        }
    })

    socket.on('getUUID', (cb) => {
        console.log('getUUid')

        const peerInfo = {
            uuid: uuidv4(),
            peer: new RTCPeerConnection({ iceServers: ICE_SERVERS }),
            polite: defaultPoliteValue,

            makingOffer: false,
            signalingState: 'new',
            completeIceGathering() {
                const peer = peerInfo.peer
                const observer = createObserver()

                const iceGatheringStateChangeHandler = (e) => {
                    console.log('iceGahtering')
                    console.log(peer.iceGatheringState)
                    if (peer.iceGatheringState === 'complete') {
                        peer.removeEventListener('icegatheringstatechange', iceGatheringStateChangeHandler)
                        return observer.res()
                    }
                }
                peer.addEventListener('icegatheringstatechange', iceGatheringStateChangeHandler)
                return observer.promise
            }
        }

        const {
            peer,
            completeIceGathering,
        } = peerInfo
        console.log(peer.signalingState)
        peer.addEventListener('negotiationneeded', async (e) => {
            console.log('negotiationNeeded')
            peerInfo.makingOffer = true
            try {
                const offer = await peer.createOffer()
                const iceGatheringPromise = completeIceGathering()
                await Promise.all([
                    peer.setLocalDescription(offer),
                    iceGatheringPromise
                ])
                socket.emit('description', { uuid: peerInfo.uuid, description: peer.localDescription })
            } catch (err) {
                console.log('Negotiation Needed Faile: Server')
            } finally {
                peerInfo.makingOffer = false
            }
        })
        peer.addEventListener('iceconnectionstatechange', (e) => {
            console.log('iceconnectionstatechange')
            console.log(peer.iceConnectionState)
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