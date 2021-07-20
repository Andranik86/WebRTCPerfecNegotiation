const path = require('path')
const { PassThrough } = require('stream')
const fs = require('fs')

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);
const { StreamInput } = require('fluent-ffmpeg-multistream')

const MEDIA_DIR = path.join(__dirname, '../media')

const VIDEO_OUTPUT_SIZE = '640x480' // '640x480' // '480x360'
const VIDEO_OUTPUT_FILE = path.join(MEDIA_DIR, './faf18d6a-c9dd-4ed4-9cea-4a95fd38131b.webm')


const readStream = fs.createReadStream(path.join(MEDIA_DIR, './faf18d6a-c9dd-4ed4-9cea-4a95fd38131b'))

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