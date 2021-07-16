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

      startNewConnection: false,
      endOfCandidates: false,
    }

    this.negotiationNeededHandler = this.negotiationNeededHandler.bind(this)
    this.iceGatheringStateChangeHandler = this.iceGatheringStateChangeHandler.bind(this)
    this.iceConnectionStateChangeHandler = this.iceConnectionStateChangeHandler.bind(this)
    this.iceCandidateHandler = this.iceCandidateHandler.bind(this)
    this.newPeerConnectionHandler = this.newPeerConnectionHandler.bind(this)

    this.closePeer = this.closePeer.bind(this)
    this.newPeerConnection = this.newPeerConnection.bind(this)

    this.socket.on('connect', () => {
      console.log('connected socket')
    })

    this.socket.on('description', async ({ uuid, description }) => {
      console.log('ignoreOffer')
      // console.log(ignoreOffer)
      console.log('description rescived')
      const offerCollision = (description.type === 'offer') &&
        (this.state.makingOffer || this.peer.signalingState !== 'stable')
      const ignoreOffer = !this.polite && offerCollision
      console.log('ignoreOffer')
      console.log(ignoreOffer)
      if (ignoreOffer) return

      if (description.type === 'offer') {
        this.setState({ makingOffer: false, connectionState: CONNECTION_STATE.NEGOTIATING, gatheringState: GATHERING_STATE.NEW })
      }
      await this.peer.setRemoteDescription(description)
      console.log(`Remote Description(${description.type}) added`)

      if (description.type === 'offer') {
        await this.peer.setLocalDescription()
        console.log('Local Description(Answer) added')
        // this.setState({ newLocalSDPReady: true })
      }
    })
  }

  polite = true
  peer = new RTCPeerConnection({})
  transceiver = null

  socket = io(SERVER_URL)

  async componentDidMount() {
    // console.log('asas')
    await this.newPeerConnection()
  }

  async componentDidUpdate(_, prevState) {
    if (this.state.startNewConnection) {
      await this.newPeerConnection()
    } else if (
      this.state.connectionState === CONNECTION_STATE.NEGOTIATING &&
      (this.state.gatheringState === GATHERING_STATE.COMPLETE && this.state.endOfCandidates)
    ) {
      this.socket.emit('description', { uuid: this.state.uuid, description: this.peer.localDescription })
      this.setState({ makingOffer: false, endOfCandidates: false })
      console.log(`Local Description Sended: ${this.peer.localDescription.type}`)
    }
  }

  async negotiationNeededHandler() {
    try {
      this.setState({ makingOffer: true, connectionState: CONNECTION_STATE.NEGOTIATING })
      await this.peer.setLocalDescription()
      console.log('Setted local Description')
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
    if (candidate === '' || candidate === null) this.setState({ endOfCandidates: true })
  }
  iceGatheringStateChangeHandler() {
    switch (this.peer.iceGatheringState) {
      case 'new':
        console.log('ICE Gathering New')
        this.setState({ gatheringState: GATHERING_STATE.NEW })
        break
      case 'gathering':
        console.log('ICE Gathering Started')
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
    console.log('iceConnectionStateChangeHandler')
    console.log(`STATE: ${this.peer.iceConnectionState}`)
    switch (this.peer.iceConnectionState) {
      case 'failed':
        console.log('connection failed')
        this.setState({ connectionState: CONNECTION_STATE.DISCONNECTED, negotiationFaileMessage: 'Connection Failed: Closing connection' })
        this.closePeer()
        break
      case 'closed':
        console.log('connection closed')
        this.transceiver = null
        this.peer = null
        this.setState({ uuid: null, connectionState: CONNECTION_STATE.CLOSED, negotiationFaileMessage: 'Connection Closed' })
        break
      case 'connected':
      case 'completed':
        this.setState({ connectionState: CONNECTION_STATE.CONNECTED, negotiationFaileMessage: null })
        break
      default:
    }
  }

  closePeer() {
    if (this.peer && this.peer.iceConnectionState !== 'closed') {
      this.peer.close()
      this.socket.emit('peerClosed', { uuid: this.state.uuid })
      return
    }
  }

  newPeerConnection() {
    this.socket.emit('getUUID', async ({ uuid }) => {
      console.log('getUUid')
      this.setState({ uuid })
      this.peer = new RTCPeerConnection({ /* iceServers: ICE_SERVERS  */ })
      this.peer.addEventListener('negotiationneeded', this.negotiationNeededHandler)
      this.peer.addEventListener('icegatheringstatechange', this.iceGatheringStateChangeHandler)
      this.peer.addEventListener('signalingstatechange', this.signalingStateChangeHandler)
      this.peer.addEventListener('iceconnectionstatechange', this.iceConnectionStateChangeHandler)
      this.peer.addEventListener('icecandidate', this.iceCandidateHandler)

      this.transceiver = await this.peer.addTransceiver('video', {
        direction: 'inactive',
      })
      console.log(`MOUNT: GetUUID: ${uuid}`)
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

      endOfCandidates: false,
    })
  }

  render() {
    // console.log(this.state)
    return (
      <div className="App">
        <ConnectionIndicator
          connectionState={this.state.connectionState} />
        <button onClick={this.newPeerConnectionHandler}>New Peer Connection</button>
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