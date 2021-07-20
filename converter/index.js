const { PassThrough } = require('stream')
const fs = require('fs')

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);
const { StreamInput } = require('fluent-ffmpeg-multistream')

const VIDEO_OUTPUT_SIZE = '640x480' // '640x480' // '480x360'
const VIDEO_OUTPUT_FILE = '/home/andranik_gh/Desktop/WebRTCPerfecNegotiation/media/recording4.webm'

const readStream = fs.createReadStream('/home/andranik_gh/Desktop/WebRTCPerfecNegotiation/media/72235533-201c-4eec-be3d-d638318b92bc')

ffmpeg()
    .addInput((new StreamInput(readStream)).url)
    .addInputOptions([
        '-f', 'rawvideo',
        '-pix_fmt', 'yuv420p',
        '-s', VIDEO_OUTPUT_SIZE,
        '-r', '30',
    ])
    .on('start', () => {
        console.log('Start recording >> ', VIDEO_OUTPUT_FILE)
    })
    .on('end', () => {
        // stream.recordEnd = true;
        console.log('Stop recording >> ', VIDEO_OUTPUT_FILE)
    })
    .on('error', () => {
        console.log('err')
    })
    // .size(VIDEO_OUTPUT_SIZE)
    .output(VIDEO_OUTPUT_FILE).run()