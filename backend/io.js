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
const { PassThrough } = require('stream')


const io = new socketIo({
    cors: ['*'],
})

const MEDIA_DIR = path.join(__dirname, '../media')
try {
    fs.mkdirSync(MEDIA_DIR)
} catch { }

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
const defaultIceRestartsLimitValue = 2
const defaultOfferTimeoutValue = 60000000
const defaultIceGatheringTimeoutValue = 2000

io.on('connect', socket => {
    console.log(`Socket connected: ${socket.id}`)

    socket.on('peerClose', ({ uuid }, cb) => {
        const eventProssesingInfo = { found: false, serverFailure: false }
        try {
            const index = peerInfoList.findIndex(currPeerInfo => currPeerInfo.uuid === uuid)
            if (index !== -1) {
                console.log(`Event peerClose: ${uuid} Closed`)
                eventProssesingInfo.found = true
                peerInfoList[index].peer.close()
                typeof cb === 'function' && cb({ info: eventProssesingInfo, data: null, success: true })
                return
            }
            console.log(`Event peerClose: Nothing Exists To Close`)
            typeof cb === 'function' && cb({ info: eventProssesingInfo, data: null, success: true })
            // const [peerInfo] = peerInfoList.splice(index, 1)
        } catch {
            eventProssesingInfo.serverFailure = true
            typeof cb === 'function' && cb({ info: eventProssesingInfo, data: null, success: false })
        }
    })

    socket.on('description', async ({ uuid, description }, cb) => {
        const eventProssesingInfo = { found: false, ignored: false, sdpAnswer: false, serverFailure: false }
        try {
            const peerInfo = peerInfoList.find(peerInfo => peerInfo.uuid === uuid)
            if (!peerInfo) {
                typeof cb === 'function' && cb({ info: eventProssesingInfo, data: null, success: false })
                return
            }
            eventProssesingInfo.found = true

            console.log(`Description Type Received: ${description.type}`)
            const {
                polite,
                makingOffer,
                peer,
                completeIceGathering,
            } = peerInfo
            const signalingState = peer.signalingState

            const offerCollision = (description === 'offer') &&
                (makingOffer || signalingState !== 'stable')
            const ignoreOffer = !polite && offerCollision

            console.log(`offerCollision: ${offerCollision}`)
            if (ignoreOffer) {
                console.log('Offer Ignored')
                eventProssesingInfo.ignored = true
                typeof cb === 'function' && cb({ info: eventProssesingInfo, data: null, success: false })
                return
            } else if (peerInfo.offerTimer) {
                clearTimeout(peerInfo.offerTimer)
                peerInfo.offerTimer = null
            }


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
                eventProssesingInfo.sdpAnswer = true
                typeof cb === 'function' && cb({ info: eventProssesingInfo, data: null, success: false })
                console.log('Answer Sended')

                if (peerInfo.track && peerInfo.track.readyState === 'ended') {
                    peerInfo.track = null
                    if (peerInfo.videoSink) {
                        peerInfo.videoSink.stop()
                        peerInfo.videoSink = null

                        peerInfo.passThrough.push(null)
                        peerInfo.passThrough = null
                    }
                }
            }
        } catch {
            eventProssesingInfo.serverFailure = true
            typeof cb === 'function' && cb({ info: eventProssesingInfo, data: null, success: false })
        }
    })

    socket.on('getUUID', (cb) => {
        const eventProssesingInfo = { serverFailure: false }
        try {
            const uuid = uuidv4()
            console.log(`\ngetUUid: ${uuid}`)

            const peerInfo = {
                uuid,
                peer: new RTCPeerConnection({ /* iceServers: ICE_SERVERS */ }),
                track: null,
                videoSink: null,
                passThrough: null,

                polite: defaultPoliteValue,

                iceRestartsLimit: defaultIceRestartsLimitValue,
                iceRestartsCount: 0,

                iceGatheringTimeout: defaultIceGatheringTimeoutValue,

                offerTimeoutValue: defaultOfferTimeoutValue,
                lastSdpOffer: null,
                offerTimer: null,

                makingOffer: false,

                async completeIceGathering(timeout) {
                    const peer = peerInfo.peer

                    const iceGatheringObserver = runObserver()
                    const iceCandidateObserver = runObserver()
                    const timeoutObserver = runObserver()

                    const iceGatheringStateChangeHandler = (e) => {
                        timeoutObserver.res()
                        if (peer.iceGatheringState === 'complete') {
                            peer.removeEventListener('icegatheringstatechange', iceGatheringStateChangeHandler)
                            console.log('\ngathering state completed')
                            return iceGatheringObserver.res()
                        }
                    }
                    const iceCandidateHandler = ({ candidate }) => {
                        timeoutObserver.res()
                        if (!candidate) {
                            peer.removeEventListener('icecandidate', iceCandidateHandler)
                            console.log('end-of-candidates received')
                            return iceCandidateObserver.res()
                        }
                    }

                    peer.addEventListener('icegatheringstatechange', iceGatheringStateChangeHandler)
                    peer.addEventListener('icecandidate', iceCandidateHandler)
                    setTimeout(() => {
                        if (timeoutObserver.resolved) {
                            return
                        }

                        timeoutObserver.rej()
                        peer.removeEventListener('icegatheringstatechange', iceGatheringStateChangeHandler)
                        peer.removeEventListener('icecandidate', iceCandidateHandler)
                    }, timeout !== null && timeout !== undefined ? timeout : peerInfo.iceGatheringTimeout)

                    try {
                        await timeoutObserver.promise

                        await Promise.all([
                            iceGatheringObserver.promise,
                            iceCandidateObserver.promise,
                        ])
                        console.log('ICE GATHERING PERFORMED')
                    } catch {
                        console.log('NO ICE GATHERING PERFORMED: Timeout Occured')
                    } finally {
                        console.log('ICE GATHERING COMPLETED\n')
                        return
                    }
                }
            }
            const {
                peer,
                completeIceGathering,
                iceRestartsLimit,
                offerTimeoutValue,
            } = peerInfo

            peer.addEventListener('track', ({ track, streams: [stream] }) => {
                console.log('track')
                if (!peerInfo.track) {
                    console.log('aaaaaaaaaaaaaaaaaaaaaaa')
                    console.log('aaaaaaaaaaaaaaaaaaaaaaa')
                    console.log('aaaaaaaaaaaaaaaaaaaaaaa')
                    console.log('aaaaaaaaaaaaaaaaaaaaaaa')
                    console.log('aaaaaaaaaaaaaaaaaaaaaaa')
                    console.log('aaaaaaaaaaaaaaaaaaaaaaa')
                    console.log('aaaaaaaaaaaaaaaaaaaaaaa')
                    if (track.kind === 'video') {
                        peerInfo.track = track

                        peerInfo.videoSink = new RTCVideoSink(track)
                        peerInfo.passThrough = new PassThrough()
                        peerInfo.videoSink.onframe = ({ frame: { width, height, data } }) => {
                            console.log(width, height, )
                            peerInfo.passThrough.push(Buffer.from(data))
                        }

                        const videoPath = path.join(MEDIA_DIR, `./${uuidv4()}`)
                        const videoFileWriter = fs.createWriteStream(videoPath)
                        peerInfo.passThrough.pipe(videoFileWriter)
                        videoFileWriter.on('finish', () => {
                            console.log(`Video File Ready: ${videoPath}`)
                        })
                    }
                }
            })

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
                    peerInfo.offerTimer = setTimeout(() => {
                        if (peer.signalingState === 'have-local-offer' && lastSdpOffer === peerInfo.lastSdpOffer) {
                            console.log(`Closing Connection: ${uuid} due to SDP Offer Timeout`)
                            peer.close()
                        }
                    }, offerTimeoutValue)
                    console.log('Offer Sended')
                } catch (err) {
                    console.log('Negotiation Needed Faile')
                } finally {
                    peerInfo.makingOffer = false
                }
            }

            function iceConnectionStateChangeHandler(e) {
                console.log(`iceConnectionStateChangeHandler: ${uuid}`)
                console.log(`STATE: ${peer.iceConnectionState}`)

                switch (peer.iceConnectionState) {
                    case 'failed':
                        if (peerInfo.iceRestartsCount < iceRestartsLimit) {
                            peerInfo.iceRestartsCount++
                            console.log(`Restarting Connection N/MAX: ${peerInfo.iceRestartsCount}/${peerInfo.iceRestartsLimit}`)
                            peer.restartIce()
                        } else {
                            peer.close()
                        }
                        break
                    case 'closed':
                        console.log(`\nConnection CLosed: ${uuid}, index: ${getIndexByUUID(uuid)}`)
                        console.log('Deleting connection from list\n')
                        const index = peerInfoList.findIndex(currPeerInfo => currPeerInfo.uuid === peerInfo.uuid)
                        if (index !== -1) {
                            peerInfoList.splice(index, 1)
                        }
                        if (peerInfo.offerTimer) {
                            clearTimeout(peerInfo.offerTimer)
                            peerInfo.offerTimer = null
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
            typeof cb === 'function' && cb({ info: eventProssesingInfo, data: { uuid }, success: true })
        } catch {
            eventProssesingInfo.serverFailure = true
            typeof cb === 'function' && cb({ info: eventProssesingInfo, data: null, success: false })
        }
    })

    socket.on('disconnect', () => {
        console.log(`Socket disocnnected: ${socket.id}`)
    })
})

module.exports = io

function runObserver() {
    const observer = {
        res: null,
        rej: null,
        promise: null,

        finished: false,
        resolved: false,
        rejected: false,
    }
    observer.promise = new Promise((res, rej) => {
        observer.res = () => {
            if (observer.finished) {
                return
            }
            observer.finished = true
            observer.resolved = true
            res()
        }
        observer.rej = () => {
            if (observer.finished) {
                return
            }
            observer.finished = true
            observer.rejected = true
            rej()
        }
    })
    return observer
}

function getIndexByUUID(uuid) {
    return peerInfoList.findIndex(peer => peer.uuid === uuid)
}