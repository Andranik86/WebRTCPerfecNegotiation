import React from 'react'
import './App.css';
import io from 'socket.io-client'

// Components
import ConnectionIndicator from './ConnectionIndicator'

import {
  SERVER_URL,
  ICE_SERVERS,
  CONNECTION_STATE,
} from './constants'

const DEFAULT_ICE_RESTARTS_LIMIT = 2
const DEFAULT_OFFER_TIMEOUT = 1 * 60 * 1000
const DEFAULT_ICE_GATHERING_TIMEOUT = 5000

class App extends React.Component {
  constructor(props) {
    super(props)
    this.polite = props.polite

    this.state = {
      uuid: null,
      makingOffer: false,
      offerTimeout: false,
      offerComplete: false,

      makingAnswer: false,
      startNewConnection: false,
      connectionState: CONNECTION_STATE.CLOSED,

      streamableConnection: false,
      recording: false,
      recordingPaused: false,
    }

    this.negotiationNeededHandler = this.negotiationNeededHandler.bind(this)
    this.iceGatheringStateChangeHandler = this.iceGatheringStateChangeHandler.bind(this)
    this.iceConnectionStateChangeHandler = this.iceConnectionStateChangeHandler.bind(this)
    this.iceCandidateHandler = this.iceCandidateHandler.bind(this)
    this.newPeerConnectionHandler = this.newPeerConnectionHandler.bind(this)
    this.startRecordHandler = this.startRecordHandler.bind(this)
    this.pauseRecordingHandler = this.pauseRecordingHandler.bind(this)
    this.stopRecordingHandler = this.stopRecordingHandler.bind(this)

    this.captureCamera = this.captureCamera.bind(this)
    this.closePeer = this.closePeer.bind(this)
    this.completeIceGathering = this.completeIceGathering.bind(this)
    this.newPeerConnection = this.newPeerConnection.bind(this)

    this.socket.on('connect', () => {
      console.log(`Socket connected: ${this.socket.id}`)
    })

    this.socket.on('description', async ({ uuid, description }) => {
      console.log(`Description Rescived: ${uuid}`)
      const socket = this.socket
      const peer = this.peer

      const offerCollision = (description.type === 'offer') &&
        (this.state.makingOffer || peer.signalingState !== 'stable')
      const ignoreOffer = !this.polite && offerCollision

      console.log(`OfferCollision: ${offerCollision}`)
      if (ignoreOffer) return

      if (this.offerTimer) {
        clearTimeout(this.offerTImer)
        this.offerTimer = null
      }

      if (description.type === 'offer') {
        this.setState({
          makingOffer: false,
          makingAnswer: true,
        })
      } else {
        this.setState({
          makingOffer: false,
        })
      }
      await peer.setRemoteDescription(description)
      console.log(`Remote Description Added: ${description.type}`)

      if (description.type === 'offer') {
        const iceGatheringPromise = this.completeIceGathering()
        await Promise.all([
          iceGatheringPromise,
          peer.setLocalDescription(),
        ])
        console.log('Local Description Added: Answer')
        this.setState({
          makingAnswer: false,
        })
        socket.emit('description', { uuid, description: peer.localDescription })
        console.log('Answer Sended')
      }
    })
  }

  polite = true
  peer = new RTCPeerConnection({})
  transceiver = null

  iceRestartsLimit = DEFAULT_ICE_RESTARTS_LIMIT
  iceRestartsCount = 0

  iceGatheringTimeout = DEFAULT_ICE_GATHERING_TIMEOUT

  offerTimeoutValue = DEFAULT_OFFER_TIMEOUT
  lastSdpOffer = null
  offerTimer = null

  socket = io(SERVER_URL)

  videoRef = React.createRef()


  async componentDidMount() {
    console.log('ComponentDidMount')
    this.setState({
      startNewConnection: true,
    })
    // await this.newPeerConnection()
  }

  async componentDidUpdate(_, prevState) {
    if (this.state.startNewConnection === true) {
      this.setState({
        startNewConnection: false,
      })
      await this.newPeerConnection()
    }
  }

  async completeIceGathering(timeout) {
    const peer = this.peer
    const iceGatheringTimeout = this.iceGatheringTimeout

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
    }, timeout !== null && timeout !== undefined ? timeout : iceGatheringTimeout)

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

  async negotiationNeededHandler() {
    const uuid = this.state.uuid
    console.log('negotiationNeededHandler')
    const peer = this.peer
    const socket = this.socket

    if (!this.transceiver) { // peer.getTransceivers().every(transceiver => transceiver.direction === 'stopped')) {
      this.transceiver = await peer.addTransceiver('video', {
        direction: 'inactive',
        streams: [],
      })
    }

    try {
      this.setState({
        makingOffer: true,
      })
      const iceGatheringPromise = this.completeIceGathering()
      await Promise.all([
        iceGatheringPromise,
        peer.setLocalDescription(),
      ])
      console.log('Local Description Added: Offer')
      socket.emit('description', { uuid, description: peer.localDescription })
      console.log('Offer Sended')

      const lastSdpOffer = peer.localDescription
      this.lastSdpOffer = lastSdpOffer
      this.offerTimer = setTimeout(() => {
        if (peer.signalingState === 'have-local-offer' && lastSdpOffer === this.lastSdpOffer) {
          console.log(`Closing Connection: ${uuid} due to SDP Offer Timeout`)
          peer.close()
          this.setState({
            makingOffer: false,
            offerTimeout: true,
          })
        }
      }, this.offerTimeoutValue)
    } catch (err) {
      console.log(err)
      this.setState({
        makingOffer: false,
        negotiationFaileMessage: 'Connection Failed: Blablabla',
      })
    }
  }
  iceCandidateHandler({ candidate }) {
    console.log('iceCandidateHandler')
  }
  iceGatheringStateChangeHandler() {
    switch (this.peer.iceGatheringState) {
      case 'new':
        console.log('ICE Gathering: New')
        break
      case 'gathering':
        console.log('ICE Gathering: Gathering')
        break
      case 'complete':
        console.log('ICE Gathering: Completed')
        break
      default:
    }
  }

  iceConnectionStateChangeHandler() {
    console.log(`\niceConnectionStateChangeHandler: ${this.state.uuid}`)
    console.log(`STATE: ${this.peer.iceConnectionState}\n`)
    switch (this.peer.iceConnectionState) {
      case 'checking':
        this.setState({
          connectionState: CONNECTION_STATE.NEGOTIATING,
          negotiationFaileMessage: 'Checking ICE Candidates',
          streamableConnection: false
        })
        break
      case 'disconnected':
        // this.peer.restartIce()
        this.closePeer()

        this.setState({
          connectionState: CONNECTION_STATE.DISCONNECTED,
          negotiationFaileMessage: 'Temporarly Disconnected: Closing Connection',
          streamableConnection: false
        })
        break
      case 'failed':
        this.closePeer()

        this.setState({
          connectionState: CONNECTION_STATE.DISCONNECTED,
          negotiationFaileMessage: 'Connection Failed: Closing connection',
          streamableConnection: false
        })
        break
      case 'closed':
        this.transceiver = null
        this.peer = null

        this.setState({
          uuid: null,
          connectionState: CONNECTION_STATE.CLOSED,
          negotiationFaileMessage: 'Connection Closed',
          streamableConnection: false
        })
        break
      case 'connected':
      case 'completed':
        this.setState({
          connectionState: CONNECTION_STATE.CONNECTED,
          offerTimeout: false,
          negotiationFaileMessage: null,
          streamableConnection: true,
        })
        break
      default:
        this.setState({
          streamableConnection: false
        })
    }
  }

  newPeerConnection() {
    this.socket.emit('getUUID', async ({ data, success }) => {
      if (!success) return
      const { uuid } = data

      console.log(`GetUUID: ${uuid}`)
      this.setState({ uuid })
      this.peer = new RTCPeerConnection({ iceServers: ICE_SERVERS  })
      this.peer.addEventListener('negotiationneeded', this.negotiationNeededHandler)
      this.peer.addEventListener('icegatheringstatechange', this.iceGatheringStateChangeHandler)
      this.peer.addEventListener('iceconnectionstatechange', this.iceConnectionStateChangeHandler)
      this.peer.addEventListener('icecandidate', this.iceCandidateHandler)

      try {
        this.mediaStream = await this.captureCamera()

        this.setState({ recording: false, paused: false })
        const [videoTrack] = this.mediaStream.getVideoTracks()
        this.transceiver = await this.peer.addTransceiver(videoTrack, {
          direction: 'inactive',
          streams: [this.mediaStream],
        })
      } catch {
        this.closePeer()
      }
    })
  }

  closePeer() {
    console.log('closePeer')
    if (this.peer && this.peer.iceConnectionState !== 'closed') {
      this.peer.close()

      this.mediaStream.getTracks().forEach(track => {
        track.stop()
      })
      this.mediaStream = null

      this.socket.emit('closePeer', { uuid: this.state.uuid })
      return
    }
  }

  newPeerConnectionHandler() {
    this.closePeer()
    this.setState({
      uuid: null,
      makingOffer: false,
      offerTimeout: false,
      offerComplete: false,

      makingAnswer: false,
      startNewConnection: true,
      connectionState: CONNECTION_STATE.CLOSED,

      streamableConnection: false,
    })
  }

  async captureCamera() {
    const videoElem = this.videoRef.current

    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user'
      },
      audio: false,
    })
    videoElem.srcObject = mediaStream
    return mediaStream
  }

  async startRecordHandler() {
    if (this.state.streamableConnection && (!this.state.recording || (this.state.recording && this.state.paused))) {
      if (!this.peer || !this.transceiver || this.transceiver.direction === 'stopped') {
        return
      }
      if (!this.transceiver) { // peer.getTransceivers().every(transceiver => transceiver.direction === 'stopped')) {
        this.transceiver = await this.peer.addTransceiver('video', {
          direction: 'inactive',
          streams: [],
        })
      }
      if (!this.transceiver.sender.track || this.transceiver.sender.track.readyState === 'ended') {
        this.mediaStream = await this.captureCamera()

        const [videoTrack] = this.mediaStream.getVideoTracks()
        this.transceiver.sender.replaceTrack(videoTrack)
      }

      this.transceiver.direction = 'sendonly'

      console.log(`\nStart Recording: ${this.state.uuid}`)
      this.setState({ recording: true, paused: false })
    }
  }

  async pauseRecordingHandler() {
    if (this.state.streamableConnection && this.state.recording && !this.state.paused) {
      if (!this.peer || !this.transceiver || this.transceiver.direction === 'stopped') {
        return
      }
      console.log(`\nPause Recording: ${this.state.uuid}`)
      this.transceiver.direction = 'inactive'
      this.setState({ recording: true, paused: true })
    }
  }

  async stopRecordingHandler() {
    if (this.state.streamableConnection && this.state.recording) {
      if (!this.peer || !this.transceiver || this.transceiver.direction === 'stopped') {
        return
      }
      console.log(`\nStop Recording: ${this.state.uuid}`)
      // this.transceiver.direction = 'inactive'
      // if (this.transceiver.sender.track) {
      //   this.transceiver.sender.track.stop()
      // }
      this.transceiver.stop()
      this.transceiver = null
      this.setState({ recording: false, paused: false })
    }
  }

  render() {
    // console.log(this.state)
    return (
      <div className="App">
        <ConnectionIndicator
          connectionState={this.state.connectionState} makingOfferAnswer={this.state.makingOffer || this.state.makingAnswer} negotiationFaileMessage={this.state.negotiationFaileMessage} />
        <button onClick={this.newPeerConnectionHandler}>New Peer Connection</button>
        <button onClick={this.startRecordHandler} className={this.state.streamableConnection && (!this.state.recording || (this.state.recording && this.state.paused)) ? "success" : "error"}>Start Recording</button>
        <button onClick={this.pauseRecordingHandler} className={this.state.streamableConnection && this.state.recording && !this.state.paused ? "success" : "error"}>Pause Recording</button>
        <button onClick={this.stopRecordingHandler} className={this.state.streamableConnection && this.state.recording ? "success" : "error"}>Stop Recording</button>
        <video autoPlay={true} muted={true} ref={this.videoRef}></video>
      </div>
    );
  }
}

export default App

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