const path = require('path')
const { PassThrough } = require('stream')
const fs = require('fs')

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);
const { StreamInput } = require('fluent-ffmpeg-multistream')

const MEDIA_DIR = path.join(__dirname, '../media')

const VIDEO_OUTPUT_SIZE = '640x480' // '640x480' // '480x360'
const VIDEO_OUTPUT_FILE = path.join(MEDIA_DIR, './37c9677d-17d4-4a04-91e5-594618c84856.webm')


const readStream = fs.createReadStream(path.join(MEDIA_DIR, './37c9677d-17d4-4a04-91e5-594618c84856'))

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