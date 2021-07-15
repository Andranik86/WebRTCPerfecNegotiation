// import logo from './logo.svg';
import React from 'react'
import './App.css';
import io from 'socket.io-client'

import {
  SERVER_URL,
  ICE_SERVERS,
  PEER_CONNECTTION_STATE,
  RECORDING_STATE,
} from './constants'

class App extends React.Component {
  constructor(props) {
    super(props)
    this.polite = props.polite

    this.state = {
      uuid: null,
      connected: false,

      negotiating: false,
      negotiationFaileMsg: null,
      makingOffer: false,
      iceGatheringFinished: false,
      newLocalSDPReady: false,
    }

    this.negotiationNeededHandler = this.negotiationNeededHandler.bind(this)
    this.iceGatheringStateChangeHandler = this.iceGatheringStateChangeHandler.bind(this)
    this.signalingStateChangeHandler = this.signalingStateChangeHandler.bind(this)
    this.iceConnectionStateChangeHandler = this.iceConnectionStateChangeHandler.bind(this)

    this.socket.on('connect', () => {
      console.log('connected socket')
    })

    this.socket.on('description', async ({ /* uuid, */ description }) => {
      const offerCollision = (description.type === 'offer') &&
        (this.state.makingOffer || this.peer.signalingState !== 'stable')
      const ignoreOffer = !this.polite && offerCollision

      if (ignoreOffer) return

      if (description.type === 'offer') {
        this.setState({ negotiating: true, makingOffer: false })
      }
      await this.peer.setRemoteDescription(description)

      if (description.type === 'offer') {
        await this.peer.setLocalDescription()
        // this.setState({ newLocalSDPReady: true })
      }
    })
  }

  polite = true

  socket = io(SERVER_URL)

  peer = new RTCPeerConnection({ iceServers: ICE_SERVERS })

  transceiver = null

  async componentDidMount() {
    // console.log('asas')
    this.socket.emit('getUUID', async ({ uuid }) => {
      this.setState({ uuid })
      this.peer.addEventListener('negotiationneeded', this.negotiationNeededHandler)
      this.peer.addEventListener('icegatheringstatechange', this.iceGatheringStateChangeHandler)
      this.peer.addEventListener('signalingstatechange', this.signalingStateChangeHandler)
      this.peer.addEventListener('iceconnectionstatechange', this.iceConnectionStateChangeHandler)

      this.transceiver = await this.peer.addTransceiver('video', {
        direction: 'inactive',
      })
    })
  }

  componentDidUpdate(_, prevState) {
    if (!prevState.iceGatheringFinished && this.state.iceGatheringFinished && this.state.negotiating && this.state.newLocalSDPReady) {
      this.socket.emit('description', { uuid: this.state.uuid, description: this.peer.localDescription })
      this.setState({ makingOffer: false, negotiationFaileMsg: null })
    }
  }

  async negotiationNeededHandler() {
    try {
      this.setState({ makingOffer: true, negotiating: true })
      await this.peer.setLocalDescription()
    } catch (err) {
      this.setState({ makingOffer: false, negotiating: false, negotiationFaileMsg: err.message })
    }
  }
  iceGatheringStateChangeHandler() {
    switch (this.peer.iceGatheringState) {
      case 'gathering':
        this.setState({ iceGatheringFinished: false })
      case 'complete':
        this.setState({ iceGatheringFinished: true })
    }
  }
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
  iceConnectionStateChangeHandler() {
    const newState = {
      connected: true,

      negotiating: false,
      negotiationFaileMsg: null,
      makingOffer: false,
      iceGatheringFinished: true,
      newLocalSDPReady: false
    }
    switch (this.peer.iceConnectionState) {
      // case 'connected':
      case 'failed':
        this.setState({ ...this.state, connected: false, negotiationFaileMsg: 'Connection Failed: Closing connection' })
        this.transceiver = null
        this.peer.close()
        break
      case 'closed':
        this.transceiver = null
        this.peer = null
        this.setState({ ...this.state, connected: false, uuid: null })
        break
      case 'completed':
        this.setState({ ...newState })
        break
    }
  }

  render() {
    return (
      <div className="App">
        <p>Test</p>
      </div>
    );
  }
}

export default App;
