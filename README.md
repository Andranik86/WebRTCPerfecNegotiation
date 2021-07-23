# WebRTCVideoSelfie
This is Webrtc P2p video recording example, with implemented perfect negotiation pattern and much more.
> NOTE: We use only RTCPeerConnection's and MediaStream API, also ffmpeg, but any MediaRecorders.

## Installation
- Clone the project: `git clone git@github.com:Andranik86/WebRTCPerfecNegotiation.git`
- Change diectory to the root of cloned project: `cd WebRTCPerfecNegotiation`
- Install dependencies: `npm i && cd backend && npm i && cd ..` (Here we additionally cd to backend and install its dependensies separately)
- Create config file: `cp ./backend/.env.example ./backend/.env`

## Usage
Start a server: `npm run start-back`

Then start a frontend: `npm run start-front`

And after frontend app apears in your browser you can play with it.