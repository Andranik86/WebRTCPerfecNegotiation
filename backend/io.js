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
    // {
    //     urls: 'stun:stun.l.google.com:19302'
    // },
    // {
    //     urls: 'stun:stun2.l.google.com:19302'
    // },
    // // {
    // //     urls: 'stun:stun3.l.google.com:19302'
    // // },
    // // {
    // //     urls: 'stun:stun4.l.google.com:19302'
    // // }
]

const peerInfoList = []
const defaultPoliteValue = false
const defaultIceRestartsLimit = 2

io.on('connect', socket => {
    console.log(`Socket connected: ${socket.id}`)

    socket.on('description', async ({ uuid, description }) => {
        const peerInfo = peerInfoList.find(peerInfo => peerInfo.uuid === uuid)
        const {
            polite,
            makingOffer,
            peer,
            completeIceGathering,
            offerTimeout,
        } = peerInfo
        const signalingState = peer.signalingState

        if(offerTimeout) {
            clearTimeout(offerTimeout)
        }

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
            await peer.setRemoteDescription(description)
        }

        if (description.type === 'offer') {
            const answer = await peer.createAnswer()
            const iceGatheringPromise = completeIceGathering()
            await Promise.all([
                iceGatheringPromise,
                peer.setLocalDescription(answer)
            ])
            socket.emit('description', { uuid, description: peer.localDescription })
        }
    })

    socket.on('getUUID', (cb) => {
        const uuid = uuidv4()
        console.log(`getUUid: ${uuid}`)

        const peerInfo = {
            uuid,
            peer: new RTCPeerConnection({ /* iceServers: ICE_SERVERS */ }),
            polite: defaultPoliteValue,
            iceRestartsLimit: defaultIceRestartsLimit,
            lastSdpOffer: null,
            offerTimeout: null,

            makingOffer: false,
            iceRestartsCount: 0,
            async completeIceGathering() {
                const peer = peerInfo.peer
                const iceGatheringObserver = createObserver()
                const iceCandidateObserver = createObserver()

                const iceGatheringStateChangeHandler = (e) => {
                    if (peer.iceGatheringState === 'complete') {
                        completed = true
                        peer.removeEventListener('icegatheringstatechange', iceGatheringStateChangeHandler)
                        console.log('gathering state completed')
                        return iceGatheringObserver.res()
                    }
                }
                const iceCandidateHandler = ({ candidate }) => {
                    if (!candidate) {
                        endOfIce = true
                        peer.removeEventListener('icecandidate', iceCandidateHandler)
                        console.log('end-of-candidates received')
                        return iceCandidateObserver.res()
                    }
                }
                peer.addEventListener('icegatheringstatechange', iceGatheringStateChangeHandler)
                peer.addEventListener('icecandidate', iceCandidateHandler)
                const finalPromise = await Promise.all([
                    iceGatheringObserver.promise,
                    iceCandidateObserver.promise,
                ])
                console.log('ICE GATHERING FINISHED')
                return finalPromise
            }
        }
        const {
            peer,
            completeIceGathering,
            iceRestartsLimit
        } = peerInfo

        async function negotiationNeededHandler(e) {
            console.log(`negotiationNeeded: ${getIndexByUUID(uuid)}`)
            peerInfo.makingOffer = true
            try {
                const offer = await peer.createOffer()
                const iceGatheringPromise = completeIceGathering()
                await Promise.all([
                    iceGatheringPromise,
                    peer.setLocalDescription(offer),
                ])
                socket.emit('description', { uuid, description: peer.localDescription })

                const lastSdpOffer = peer.localDescription
                peerInfo.lastSdpOffer = lastSdpOffer
                peerInfo.offerTimeout = setTimeout(() => {
                    if(peer.signalingState === 'have-local-offer' && lastSdpOffer === peerInfo.lastSdpOffer) {
                        peer.close()
                    }
                }, 3000)
                console.log('local description sended')
            } catch (err) {
                console.log('Negotiation Needed Faile')
            } finally {
                peerInfo.makingOffer = false
            }
        }

        function iceConnectionStateChangeHandler(e) {
            console.log('\n\n')
            console.log(`iceConnectionStateChangeHandler: ${getIndexByUUID(uuid)}`)
            console.log(`STATE: ${peer.iceConnectionState}`)

            switch (peer.iceConnectionState) {
                case 'failed':
                    // Maybe we need to add restart
                    // But in MDN says that this is due to failed state of some of the transport in connection
                    // peer.close()
                    if (peerInfo.iceRestartsCount < iceRestartsLimit) {
                        peerInfo.iceRestartsCount++
                        console.log(`Restarting Connection: ${peerInfo.iceRestartsCount}/${peerInfo.iceRestartsLimit}`)
                        peer.restartIce()
                    } else {
                        peer.close()
                    }
                    break
                case 'closed':
                    console.log(`\nConnection CLosed: ${getIndexByUUID(uuid)}, index: ${getIndexByUUID(uuid)}\n\n`)
                    console.log('Deleting connection from list')
                    const index = peerInfoList.findIndex(currPeerInfo => currPeerInfo.uuid === peerInfo.uuid)
                    if (index !== -1) {
                        peerInfoList.splice(index, 1)
                    }
                    if(peerInfo.offerTimeout) {
                        clearTimeout(peerInfo.offerTimeout)
                    }
                    peer.removeEventListener('negotiationneeded', negotiationNeededHandler)
                    peer.removeEventListener('iceconnectionstatechange', iceConnectionStateChangeHandler)
                    break
                default:
            }
        }

        peer.addEventListener('negotiationneeded', negotiationNeededHandler)
        peer.addEventListener('iceconnectionstatechange', iceConnectionStateChangeHandler)
        peerInfoList.push(peerInfo)
        cb({ uuid })
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

function getIndexByUUID(uuid) {
    return peerInfoList.findIndex(peer => peer.uuid === uuid)
}