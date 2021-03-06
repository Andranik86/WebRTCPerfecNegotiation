import React from 'react'

import {
    CONNECTION_STATE,
    GATHERING_STATE,
} from '../constants'

function ConnectionIndicator(props) {
    const activityClassName = ['connectionActivity']
    let activityText
    switch (props.connectionState) {
        case CONNECTION_STATE.DISCONNECTED:
            activityClassName.push('disconnected')
            activityText = 'Peer Disconnected'
            break
        case CONNECTION_STATE.NEGOTIATING:
            activityClassName.push('connecting')
            activityText = `Peer Negotiating: ${CONNECTION_STATE.NEGOTIATING}`
            break
        case CONNECTION_STATE.CONNECTED:
            activityClassName.push('connected')
            activityText = 'Peer Connected'
            break
        case CONNECTION_STATE.NEW:
            activityText = 'New Peer'
        case CONNECTION_STATE.CLOSED:
            activityText = 'Peer Closed'
        default:
            activityClassName.push('closed')
            break
    }
    if (props.makingOfferAnswer && props.connectionState !== CONNECTION_STATE.CONNECTED) {
        activityClassName.push('connecting')
        activityText = `Peer Negotiating: ${props.connectionState}`
    }
    return <>
        <div className={activityClassName.join(' ')}></div>
        {props.negotiationFaileMessage ? <p>Negotiation Faile Message: {props.negotiationFaileMessage}</p> : null}
        <p>{activityText}</p>
    </>
}

export default ConnectionIndicator