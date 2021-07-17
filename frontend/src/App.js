// import logo from './logo.svg';
import React from 'react'
import './App.css';
import io from 'socket.io-client'

// Components
import ConnectionIndicator from './ConnectionIndicator'

import {
  SERVER_URL,
  ICE_SERVERS,
  CONNECTION_STATE,
  GATHERING_STATE,
} from './constants'

class App extends React.Component {
  constructor(props) {
    super(props)
    this.polite = props.polite

    this.state = {
      uuid: null,
      makingOffer: false,
      connectionState: CONNECTION_STATE.NEW,
      gatheringState: GATHERING_STATE.NEW,
      negotiationFaileMessage: null,

      streamableConnection: false,
      directionChanged: false,

      startNewConnection: false,
      endOfCandidates: false,
    }

    this.negotiationNeededHandler = this.negotiationNeededHandler.bind(this)
    this.iceGatheringStateChangeHandler = this.iceGatheringStateChangeHandler.bind(this)
    this.iceConnectionStateChangeHandler = this.iceConnectionStateChangeHandler.bind(this)
    this.iceCandidateHandler = this.iceCandidateHandler.bind(this)
    this.newPeerConnectionHandler = this.newPeerConnectionHandler.bind(this)
    this.startRecordHandler = this.startRecordHandler.bind(this)

    this.closePeer = this.closePeer.bind(this)
    this.newPeerConnection = this.newPeerConnection.bind(this)

    this.socket.on('connect', () => {
      console.log('connected socket')
    })

    this.socket.on('description', async ({ uuid, description }) => {
      console.log(`Description Rescived: ${uuid}`)
      const offerCollision = (description.type === 'offer') &&
        (this.state.makingOffer || this.peer.signalingState !== 'stable')
      const ignoreOffer = !this.polite && offerCollision
      console.log('offerCollision')
      console.log(offerCollision)
      if (ignoreOffer) return

      if (description.type === 'offer') {
        this.setState({ makingOffer: false, connectionState: CONNECTION_STATE.NEGOTIATING, gatheringState: GATHERING_STATE.NEW })
      }
      await this.peer.setRemoteDescription(description)
      console.log(`Remote Description Added: ${description.type}`)

      if (description.type === 'offer') {
        await this.peer.setLocalDescription()
        console.log('Local Description Added: Answer')
        // this.setState({ newLocalSDPReady: true })
      }
    })
  }

  polite = true
  peer = new RTCPeerConnection({})
  transceiver = null

  socket = io(SERVER_URL)

  videoRef = React.createRef()


  async componentDidMount() {
    console.log('ComponentDidMount')
    await this.newPeerConnection()
  }

  async componentDidUpdate(_, prevState) {
    if (this.state.startNewConnection) {
      await this.newPeerConnection()
      this.setState({ startNewConnection: false })
    } else if (
      this.state.connectionState === CONNECTION_STATE.NEGOTIATING &&
      (this.state.gatheringState === GATHERING_STATE.COMPLETE && this.state.endOfCandidates)
    ) {
      this.socket.emit('description', { uuid: this.state.uuid, description: this.peer.localDescription })
      this.setState({ makingOffer: false, endOfCandidates: false })
      console.log(`Local Description Sended: ${this.peer.localDescription.type}`)
    } else if (this.state.directionChanged && this.state.connectionState === CONNECTION_STATE.NEGOTIATING) {
      console.log('direction changed')
      this.socket.emit('description', { uuid: this.state.uuid, description: this.peer.localDescription })
      this.setState({ makingOffer: false, endOfCandidates: false, directionChanged: false })
    }
  }

  async negotiationNeededHandler() {
    console.log('negotiationNeededHandler')
    try {
      this.setState({ makingOffer: true, connectionState: CONNECTION_STATE.NEGOTIATING })
      await this.peer.setLocalDescription()
      console.log('Local Description Added: Offer')
      console.log(this.peer.signalingState)
    } catch (err) {
      console.log(err)
      switch (this.peer.iceConnectionState) {
        case 'failed':
        case 'disconnected':
          this.setState({ makingOffer: false, connectionState: CONNECTION_STATE.DISCONNECTED, negotiationFaileMessage: err.message })
          break
        case 'new':
          this.setState({ makingOffer: false, connectionState: CONNECTION_STATE.NEW, negotiationFaileMessage: err.message })
      }
    }
  }
  iceCandidateHandler({ candidate }) {
    console.log('iceCandidateHandler')
    if (candidate === '' || candidate === null) this.setState({ endOfCandidates: true })
  }
  iceGatheringStateChangeHandler() {
    console.log('this.peer.iceGatheringState')
    console.log(this.peer.iceGatheringState)
    switch (this.peer.iceGatheringState) {
      case 'new':
        console.log('ICE Gathering New')
        this.setState({ gatheringState: GATHERING_STATE.NEW })
        break
      case 'gathering':
        console.log('ICE Gathering Starteda')
        this.setState({ gatheringState: GATHERING_STATE.GATHERING })
        break
      case 'complete':
        console.log('ICE Gathering Completed')
        this.setState({ gatheringState: GATHERING_STATE.COMPLETE })
        break
      default:
    }
  }

  iceConnectionStateChangeHandler() {
    console.log(`\niceConnectionStateChangeHandler: ${this.state.uuid}`)
    console.log(`STATE: ${this.peer.iceConnectionState}\n`)
    switch (this.peer.iceConnectionState) {
      case 'disconnected':
        // this.peer.restartIce()
        this.setState({ connectionState: CONNECTION_STATE.DISCONNECTED, negotiationFaileMessage: 'Temporarly Disconnected: Closing Connection', streamableConnection: false })
        this.closePeer()
        break
      case 'failed':
        this.setState({ connectionState: CONNECTION_STATE.DISCONNECTED, negotiationFaileMessage: 'Connection Failed: Closing connection', streamableConnection: false })
        this.closePeer()
        break
      case 'closed':
        this.transceiver = null
        this.peer = null
        this.setState({ uuid: null, connectionState: CONNECTION_STATE.CLOSED, negotiationFaileMessage: 'Connection Closed', streamableConnection: false })
        break
      case 'connected':
      case 'completed':
        this.setState({ connectionState: CONNECTION_STATE.CONNECTED, negotiationFaileMessage: null, streamableConnection: true })
        break
      default:
        this.setState({ streamableConnection: false })
    }
  }

  closePeer() {
    console.log('close Peer')
    if (this.peer && this.peer.iceConnectionState !== 'closed') {
      this.peer.close()
      this.peer = null
      this.transceiver = null

      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null

      this.socket.emit('peerClose', { uuid: this.state.uuid })
      return
    }
  }

  newPeerConnection() {
    this.socket.emit('getUUID', async ({ data, success }) => {
      if (!success) return
      const { uuid } = data
      
      console.log(`GetUUID: ${uuid}`)
      this.setState({ uuid })
      this.peer = new RTCPeerConnection({ /* iceServers: ICE_SERVERS  */ })
      this.peer.addEventListener('negotiationneeded', this.negotiationNeededHandler)
      this.peer.addEventListener('icegatheringstatechange', this.iceGatheringStateChangeHandler)
      this.peer.addEventListener('signalingstatechange', this.signalingStateChangeHandler)
      this.peer.addEventListener('iceconnectionstatechange', this.iceConnectionStateChangeHandler)
      this.peer.addEventListener('icecandidate', this.iceCandidateHandler)

      try {
        const videoElem = this.videoRef.current

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user'
          },
          audio: false,
        })
        videoElem.srcObject = mediaStream
        this.mediaStream = mediaStream

        this.setState({ directionChanged: false })
        this.transceiver = await this.peer.addTransceiver('video', {
          direction: 'inactive',
          streams: [mediaStream]
        })
        // this.transceiver.direction 
        // this.transceiver.sender.replaceTrack(null)
      } catch {
        this.peerClose()
      }
    })
  }

  newPeerConnectionHandler() {
    this.closePeer()
    this.setState({
      uuid: null,
      makingOffer: false,
      connectionState: CONNECTION_STATE.NEW,
      gatheringState: GATHERING_STATE.NEW,
      negotiationFaileMessage: null,
      startNewConnection: true,

      endOfCandidates: false,
    })
  }

  async startRecordHandler() {
    if (this.state.streamableConnection) {
      if (!this.peer || !this.transceiver) {
        return
      }
      console.log(`\nStart Recording: ${this.state.uuid}`)
      const [videoTrack] = this.mediaStream.getVideoTracks()
      this.transceiver.direction = 'sendonly'
      this.setState({ directionChanged: true })
      await this.transceiver.sender.replaceTrack(videoTrack)
      setTimeout(() => {
        // this.transceiver.direction = 'inactive'
        // console.log(this.peer.getTransceivers())
      }, 4000)
      // this.transceiver.direction = 'sendrecv'
      this.setState({ videoRecording: true })
    }

  }

  render() {
    // console.log(this.state)
    return (
      <div className="App">
        <ConnectionIndicator
          connectionState={this.state.connectionState} negotiationFaileMessage={this.state.negotiationFaileMessage} />
        <button onClick={this.newPeerConnectionHandler}>New Peer Connection</button>
        <button onClick={this.startRecordHandler} className={this.state.streamableConnection ? "success" : "error"}>Start Recording</button>
        <video autoplay={'true'} muted={'true'} ref={this.videoRef}></video>
      </div>
    );
  }
}

export default App;




/*
    this.signalingStateChangeHandler = this.signalingStateChangeHandler.bind(this)
  signalingStateChangeHandler() {
    switch (this.peer.signalingState) {
      case 'stable':
      case 'have-local-offer':
      case 'have-local-pranswer':
      case 'have-remote-pranswer':
        this.setState({ newLocalSDPReady: true })
        break
      default:
        this.setState({ newLocalSDPReady: false })
    }
  }



*/