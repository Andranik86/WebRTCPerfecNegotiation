const SERVER_URL = 'http://localhost:8000'
const ICE_SERVERS = [
    {
        urls: 'stun:stun1.l.google.com:19302'
    },
    {
        urls: 'stun:stun2.l.google.com:19302'
    },
    // {
    //     urls: 'stun:stun3.l.google.com:19302'
    // },
    // {
    //     urls: 'stun:stun4.l.google.com:19302'
    // }
]
const CONNECTION_STATE = {
    NEW: 'NEW',
    CONNECTED: 'CONNECTED',
    DISCONNECTED: 'DISCONNECTED',
    NEGOTIATING: 'NEGOTIATING',
    CLOSED: 'CLOSED'
  }
  
  const GATHERING_STATE = {
    NEW: 'NEW',
    GATHERING: 'GATHERING',
    COMPLETE: 'COMPLETE',
  }

export {
    SERVER_URL,
    ICE_SERVERS,
    CONNECTION_STATE,
    GATHERING_STATE,
}



/* 

const PEER_CONNECTTION_STATE = {
    DISCONNECTED: 'DISCONNECTED',
    CONNECTED: 'CONNECTED',
    NEGOTIATING: 'NEGOTIATING',
}
const RECORDING_STATE = {
    RECORDING: 'RECORDING',
    STOPED: 'STOPED',
}

*/